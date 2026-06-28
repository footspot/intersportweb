-- * SECURITY: back-office (admin/employee) access requires a PASSWORD session.
-- *
-- * is_admin()/is_backoffice() previously checked only the role, so a passwordless
-- * session for a back-office account — customer magic-link (signInWithOtp) or
-- * GoTrue email recovery — could still satisfy RLS and READ admin-only tables
-- * directly via PostgREST (fund_transactions, profiles, labels, footspot_*, …).
-- * The edge functions already reject such sessions on writes (verifyAdmin's `amr`
-- * check in _shared/auth.ts); this pushes the same rule into the RLS gate so
-- * direct reads are covered too. Back-office must sign in with a password on
-- * /admin/login (then 2FA). See [[project_backoffice_no_magiclink]].

-- * True unless the JWT `amr` (authentication methods reference) is present, a
-- * non-empty array, and carries NO `password` method — i.e. the session was
-- * established passwordlessly (magic link / OTP / recovery). Fail-open: when
-- * `amr` is absent/empty we return true, so a legitimate password admin is never
-- * locked out by a missing claim. GoTrue method names verified against
-- * auth.mfa_amr_claims: `password`, `otp`, `totp`.
CREATE OR REPLACE FUNCTION public.is_password_session()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN auth.jwt() -> 'amr' IS NULL THEN true
    WHEN jsonb_typeof(auth.jwt() -> 'amr') <> 'array' THEN true
    WHEN jsonb_array_length(auth.jwt() -> 'amr') = 0 THEN true
    ELSE EXISTS (
      SELECT 1 FROM jsonb_array_elements(auth.jwt() -> 'amr') e
      WHERE e ->> 'method' = 'password'
    )
  END;
$function$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
     AND public.is_password_session();
$function$;

CREATE OR REPLACE FUNCTION public.is_backoffice()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','employee'))
     AND public.is_password_session();
$function$;
