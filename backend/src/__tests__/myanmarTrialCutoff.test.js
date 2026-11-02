import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationUrl = new URL("../../supabase/migrations/0056_myanmar_trial_cutoff.sql", import.meta.url);
const read = name => readFileSync(new URL(`./fixtures/historical-migrations/${name}`, import.meta.url), "utf8");
const definition = (sql, name) => sql.match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?end \\$\\$;`))?.[0];

describe("forward-only Myanmar trial cutoff migration", () => {
  it("exists without replacing earlier migrations", () => expect(existsSync(migrationUrl)).toBe(true));
  it.each([
    ["customer_trial_eligibility", "0035_trial_recovery_authorization.sql"],
    ["create_customer_trial", "0036_trial_claim_alias_fix.sql"],
    ["claim_trial_provisioning", "0035_trial_recovery_authorization.sql"],
  ])("changes only access-day predicates in the latest %s definition", (name, prior) => {
    const old = definition(read(prior), name);
    expect(old).toBeTruthy();
    const expected = old
      .replaceAll("expiry_date>=(now() at time zone 'Asia/Bangkok')::date", "expiry_date>=((now() at time zone 'Asia/Bangkok') - interval '4 hours 30 minutes')::date")
      .replaceAll("expiry_date>=start_day", "expiry_date>=((now() at time zone 'Asia/Bangkok') - interval '4 hours 30 minutes')::date");
    expect(definition(readFileSync(migrationUrl, "utf8"), name)).toBe(expected);
  });
  it("retains service-role-only execution and schema reload", () => {
    const sql = readFileSync(migrationUrl, "utf8");
    for (const signature of ["customer_trial_eligibility(uuid,uuid)", "create_customer_trial(uuid,uuid,text,uuid,text)", "claim_trial_provisioning(uuid,uuid,uuid,uuid)"]) {
      expect(sql).toContain(`revoke all on function public.${signature} from public;`);
      expect(sql).toContain(`grant execute on function public.${signature} to service_role;`);
    }
    expect(sql).toContain("notify pgrst,'reload schema';");
    expect(sql.match(/create or replace function/g)).toHaveLength(3);
    expect(sql).not.toContain("relocate");
  });
});
