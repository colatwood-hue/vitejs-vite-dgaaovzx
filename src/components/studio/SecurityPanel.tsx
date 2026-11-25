"use client";

import { useActionState, useState, useTransition } from "react";
import {
  changePasswordAction,
  confirmTotpAction,
  disableTotpAction,
  regenerateCodesAction,
  signOutOthersAction,
  startTotpAction,
  type SecurityState,
} from "@/actions/security";

function Status({ state }: { state: SecurityState }) {
  if (!state) return null;
  return (
    <p role="status" className={`text-sm ${state.ok ? "text-ok" : "text-danger"}`}>
      {state.message}
    </p>
  );
}

function RecoveryCodes({ codes }: { codes: string[] }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-sm border border-bronze/40 bg-paper p-4">
      <p className="text-sm font-medium">Save these recovery codes now. They won&rsquo;t be shown again.</p>
      <p className="mt-1 text-xs text-muted">Each works once if you lose your phone. Store them in your password manager.</p>
      <ul className="mt-3 grid grid-cols-2 gap-1 font-mono text-sm">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <button
        type="button"
        className="btn btn-ghost btn-sm mt-3"
        onClick={async () => {
          await navigator.clipboard.writeText(codes.join("\n"));
          setCopied(true);
        }}
      >
        {copied ? "Copied" : "Copy codes"}
      </button>
    </div>
  );
}

export function SecurityPanel({ totpEnabled, recoveryLeft, recoveryJustUsed }: { totpEnabled: boolean; recoveryLeft: number; recoveryJustUsed: boolean }) {
  const [enrol, setEnrol] = useState<{ secret: string; qr: string } | null>(null);
  const [starting, startTransition] = useTransition();
  const [confirmState, confirmAction, confirming] = useActionState(confirmTotpAction, null);
  const [regenState, regenAction, regenerating] = useActionState(regenerateCodesAction, null);
  const [disableState, disableAction, disabling] = useActionState(disableTotpAction, null);
  const [pwState, pwAction, changing] = useActionState(changePasswordAction, null);
  const [othersState, othersAction, signingOut] = useActionState(signOutOthersAction, null);

  const codes = confirmState?.codes ?? regenState?.codes;

  return (
    <div className="mt-4 space-y-6">
      {recoveryJustUsed && (
        <p className="rounded-sm border border-warn/30 bg-warn/10 p-3 text-sm text-warn">
          You signed in with a recovery code. {recoveryLeft} remain. If your phone is lost, set up two-factor again.
        </p>
      )}

      <div>
        <h3 className="font-medium">Two-factor sign-in</h3>
        {codes && <div className="mt-3"><RecoveryCodes codes={codes} /></div>}
        {totpEnabled || confirmState?.ok ? (
          <div className="mt-2 space-y-4">
            <p className="text-sm text-ok">On. Signing in requires a code from your authenticator app. {recoveryLeft > 0 && !codes && `${recoveryLeft} recovery codes left.`}</p>
            <form action={regenAction} className="flex flex-wrap items-end gap-2">
              <div>
                <label htmlFor="regen-pw" className="field-label">
                  Password
                </label>
                <input id="regen-pw" name="password" type="password" autoComplete="current-password" required className="input w-56" />
              </div>
              <button className="btn btn-ghost btn-sm" disabled={regenerating}>
                New recovery codes
              </button>
              <Status state={regenState} />
            </form>
            <form action={disableAction} className="flex flex-wrap items-end gap-2" onSubmit={(e) => !confirm("Turn off two-factor sign-in?") && e.preventDefault()}>
              <div>
                <label htmlFor="disable-pw" className="field-label">
                  Password
                </label>
                <input id="disable-pw" name="password" type="password" autoComplete="current-password" required className="input w-56" />
              </div>
              <button className="btn btn-ghost btn-sm text-danger" disabled={disabling}>
                Turn off
              </button>
              <Status state={disableState} />
            </form>
          </div>
        ) : enrol ? (
          <div className="mt-3 grid gap-4 sm:grid-cols-[auto_1fr]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={enrol.qr} alt="QR code to add The Dash to your authenticator app" width={180} height={180} className="border border-rule" />
            <div className="space-y-3 text-sm">
              <p>Scan with 1Password, Google Authenticator, Authy or similar. Or enter this key:</p>
              <p className="break-all rounded-sm bg-paper-deep px-2 py-1 font-mono text-xs">{enrol.secret.match(/.{1,4}/g)?.join(" ")}</p>
              <form action={confirmAction} className="flex flex-wrap items-end gap-2">
                <div>
                  <label htmlFor="enrol-code" className="field-label">
                    6-digit code from the app
                  </label>
                  <input id="enrol-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" required className="input w-40 font-mono" />
                </div>
                <button className="btn btn-sm" disabled={confirming}>
                  {confirming ? "Checking…" : "Turn on"}
                </button>
              </form>
              <Status state={confirmState} />
            </div>
          </div>
        ) : (
          <div className="mt-2 space-y-2">
            <p className="text-sm text-muted">Off. Strongly recommended: the studio holds private journal entries and voice notes.</p>
            <button type="button" className="btn btn-sm" disabled={starting} onClick={() => startTransition(async () => setEnrol(await startTotpAction()))}>
              {starting ? "Preparing…" : "Set up two-factor"}
            </button>
          </div>
        )}
      </div>

      <form action={pwAction} className="space-y-3 border-t border-rule pt-5">
        <h3 className="font-medium">Change password</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="pw-current" className="field-label">
              Current
            </label>
            <input id="pw-current" name="current" type="password" autoComplete="current-password" required className="input" />
          </div>
          <div>
            <label htmlFor="pw-next" className="field-label">
              New (12+ characters)
            </label>
            <input id="pw-next" name="next" type="password" autoComplete="new-password" minLength={12} required className="input" />
          </div>
          <div>
            <label htmlFor="pw-confirm" className="field-label">
              Confirm new
            </label>
            <input id="pw-confirm" name="confirm" type="password" autoComplete="new-password" minLength={12} required className="input" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn btn-ghost btn-sm" disabled={changing}>
            Change password
          </button>
          <Status state={pwState} />
        </div>
      </form>

      <form action={othersAction} className="flex flex-wrap items-center gap-3 border-t border-rule pt-5">
        <button className="btn btn-ghost btn-sm" disabled={signingOut}>
          Sign out all other devices
        </button>
        <Status state={othersState} />
      </form>
    </div>
  );
}
