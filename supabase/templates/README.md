# Supabase email templates

Branded versions of the emails Supabase Auth sends. Supabase keeps templates
in its dashboard, so paste them in after any change:

Authentication > Emails > Templates
(https://supabase.com/dashboard/project/gwucihgwsvugnxswyuui/auth/templates)

| Template | Subject | Body |
| --- | --- | --- |
| Magic Link | `Your Trace sign-in link` | `magic-link.html` |
| Confirm signup | `Welcome to Trace: confirm your email` | `confirm-signup.html` |

They use `{{ .ConfirmationURL }}` and `{{ .Email }}`. The logo loads from
https://trace-proof.netlify.app/apple-icon.png, so keep that file deployed.
