import { db } from "@/lib/db";
import { check } from "@/lib/errors";
import { externalLinks, publicUrl } from "@/lib/urls";
import { lock } from "./audit";

export function matchesAlias(bio: string, alias: string) {
  const compact = (value: string) => value.normalize("NFKC").toLowerCase().replace(/[\s_\-·.]+/g, "");
  const tokens = bio.normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const target = compact(alias);
  for (let index = 0; index < tokens.length; index++) {
    let joined = "";
    for (const word of tokens.slice(index, index + 6)) {
      joined += word;
      if (joined === target) return true;
      if (joined.length >= target.length) break;
    }
  }
  return false;
}
export function matchesHost(host: string, domain: string) { return host === domain || host.endsWith("." + domain); }

export async function scanSubscriptions(accountId: string) {
  return db.$transaction(async (tx) => {
    await lock(tx, "subscriptions:" + accountId);
    const account = await tx.creatorPlatformAccount.findUniqueOrThrow({ where: { id: accountId }, include: { creator: true } });
    check(account.creator.reviewStatus !== "HOLD" && account.creator.adultStatus !== "EXCLUDED", "검토 보류 중인 계정입니다.");
    const rules = await tx.subscriptionPlatform.findMany({ include: { aliases: true } });
    const prohibited = account.platform === "YOUTUBE" && account.source === "OFFICIAL_API";
    const text = prohibited ? "" : account.bio ?? "";
    const links = prohibited ? [] : [...new Set([...account.links, ...externalLinks(text)])];
    const evidence = rules.flatMap((platform) => {
      const matches = platform.aliases.flatMap((alias) => {
        if (!alias.isDomain) return matchesAlias(text.replace(/https:\/\/\S+/gi, ""), alias.value)
          ? [{ url: account.profileUrl, matched: alias.value, ambiguous: alias.ambiguous }] : [];
        return links.filter((link) => matchesHost(publicUrl(link)?.hostname ?? "", alias.value))
          .map((url) => ({ url, matched: alias.value, ambiguous: alias.ambiguous }));
      });
      return matches.length ? [{ platformId: platform.id, matches }] : [];
    });
    await tx.creatorSubscriptionPlatform.deleteMany({ where: { accountId } });
    for (const { platformId, matches } of evidence) {
      await tx.creatorSubscriptionPlatform.create({ data: { accountId, platformId, evidence: { create: matches } } });
    }
    const incomplete = links.some((value) => {
      const host = publicUrl(value)?.hostname.replace(/^www\./, "");
      return host && ["bit.ly", "t.co", "tinyurl.com", "linktr.ee", "beacons.ai", "bio.link", "lnk.bio"].includes(host);
    });
    const status = evidence.some(({ matches }) => matches.some((match) => !match.ambiguous)) ? "DETECTED" :
      evidence.length ? "REVIEW" : incomplete || (!text.trim() && !links.length) ? "UNKNOWN" : "NONE";
    await tx.creatorPlatformAccount.update({ where: { id: accountId }, data: { detectionStatus: status, detectedAt: new Date() } });
    return { status, matches: evidence.length };
  });
}
