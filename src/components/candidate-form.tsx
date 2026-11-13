import { Button } from "./ui/button";
import { Action, Field, Hidden, Input, Select } from "./ui/form";
import { OptionList, stages } from "./filters";

type Candidate = { stage: string; active: boolean; assigneeId: string | null; followUpAt: Date | null };
export function CandidateForm({ id, candidate, admins, next }: { id: string; candidate?: Candidate | null; admins: { id: string; email: string }[]; next: string }) {
  return <Action action="candidate" next={next} className="grid gap-3">
    <Hidden value={id} />
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label="영입 단계"><Select name="stage" defaultValue={candidate?.stage ?? "CANDIDATE"}><OptionList values={stages} /></Select></Field>
      <Field label="담당자"><Select name="assigneeId" defaultValue={candidate?.assigneeId ?? ""}><option value="">미지정</option>{admins.map((user) => <option value={user.id} key={user.id}>{user.email}</option>)}</Select></Field>
      <Field label="후속 연락일"><Input name="followUpAt" type="date" defaultValue={candidate?.followUpAt ? new Date(candidate.followUpAt.getTime() + 9 * 3600000).toISOString().slice(0, 10) : undefined} /></Field>
    </div>
    <div className="flex flex-wrap gap-2"><Button name="active" value="yes" variant="primary">{candidate?.active ? "진행 상태 저장" : "영입 후보 등록"}</Button>{candidate?.active && <Button name="active" value="no">후보 해제</Button>}</div>
  </Action>;
}
