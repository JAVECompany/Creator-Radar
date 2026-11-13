import { platformOptions, OptionList } from "./filters";
import { Button } from "./ui/button";
import { Action, Field, Hidden, Input, Select, Textarea } from "./ui/form";

export function ManualProfile({ creatorId, next }: { creatorId?: string; next: string }) {
  return <Action action="profile" next={next} className="grid gap-4 p-5">
    {creatorId && <Hidden name="existingCreatorId" value={creatorId} />}
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="SNS 플랫폼"><Select name="platform" required><OptionList values={platformOptions} /></Select></Field>
      {!creatorId && <Field label="표시 이름"><Input name="name" required maxLength={160} /></Field>}
      {creatorId && <Hidden name="name" value="연결 계정" />}
      <Field label="공개 프로필 URL"><Input name="url" type="url" placeholder="https://www.instagram.com/계정명/" required maxLength={2048} /></Field>
      <Field label="공개 소개 외부 링크"><Input name="link" type="url" maxLength={2048} /></Field>
      {creatorId ? <Field label="동일인 확인 근거 URL"><Input name="linkEvidence" type="url" required maxLength={2048} /></Field> :
        <><Field label="국가"><Input name="country" maxLength={80} /></Field><Field label="지역"><Input name="region" maxLength={80} /></Field></>}
    </div>
    <Field label="공개 프로필 소개"><Textarea name="bio" maxLength={2000} /></Field>
    <div><Button variant="primary">{creatorId ? "계정 연결" : "프로필 등록"}</Button></div>
  </Action>;
}
