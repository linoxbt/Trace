import { attestationView, EngineError } from "@trace/engine";
import { Logo } from "@/components/logo";
import { SignOff } from "@/components/sign-off";
import { engine } from "@/server/engine";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign off", robots: { index: false } };

/** The attester's page: the line, the statement, and a signature. No account needed. */
export default async function Attest({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const v = await attestationView(engine(), token).catch((err) => {
    if (err instanceof EngineError && err.status === 404) return null;
    throw err;
  });
  return (
    <main className="grid min-h-dvh place-items-center bg-[#f6f6f9] px-4 py-10">
      <div className="w-full max-w-md rounded-[22px] border border-[#ebebf0] bg-white p-7 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <Logo size={26} />
        {!v ? (
          <p className="mt-6 text-[15px] text-muted">This sign-off link isn&apos;t valid. Ask whoever sent it for a new one.</p>
        ) : (
          <>
            <div className="mt-6 text-[13px] font-medium text-muted">{v.address}</div>
            <h1 className="mt-1 text-[22px] font-semibold tracking-[-0.02em]">
              {v.line} · {v.lineTitle}
            </h1>
            <p className="mt-1 text-[13.5px] text-muted">You&apos;re asked to confirm this as {v.email}. Payment for this line is released on your sign-off.</p>
            <blockquote className="mt-5 rounded-2xl bg-[#f7f7fa] p-4 text-[15px] leading-relaxed">&ldquo;{v.statement}&rdquo;</blockquote>
            <SignOff token={token} signedName={v.signedName} signedAt={v.signedAt} expired={v.expired} />
          </>
        )}
      </div>
    </main>
  );
}
