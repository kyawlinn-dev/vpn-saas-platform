# Historical trial-function references

0035/0036 are byte-preserved development history used only to compare the
forward-only 0056 cutoff change and the earlier SQL alias repair. They are not
release migrations and must not be applied to production. The candidate omits
mixed 0027–0036 from `supabase/migrations`; the release's shared-core SQL will be
prepared and rehearsed separately.

Ansible excludes `src/__tests__/` from backend deployment. Keep these references
here rather than restoring excluded schema to the deployment migration chain.
