import { redirect } from "next/navigation";
import { login } from "@/lib/auth";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;

  async function doLogin(formData: FormData) {
    "use server";
    const ok = await login(String(formData.get("email")), String(formData.get("password")));
    redirect(ok ? "/" : "/login?error=1");
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6 bg-[#181818]"
      style={{
        backgroundImage:
          "radial-gradient(ellipse 60% 50% at 70% 20%, rgba(28,176,255,.07), transparent), radial-gradient(ellipse 50% 40% at 20% 85%, rgba(64,255,153,.05), transparent)",
      }}
    >
      <div
        className="w-[380px] rounded-2xl border-2 border-transparent p-8 pt-9 text-white flex flex-col gap-6"
        style={{
          background:
            "linear-gradient(#212121, #212121) padding-box, linear-gradient(120deg, transparent 25%, #1cb0ff, #40ff99) border-box",
        }}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-[34px] h-[34px] rounded-[9px] bg-gradient-to-br from-brand-a to-brand-b flex items-center justify-center font-display font-extrabold text-[#161616]">
            L
          </div>
          <div>
            <div className="font-display font-bold text-[17px] leading-none">LOYA</div>
            <div className="text-[10px] tracking-[0.6px] uppercase text-[#bdb8b8] mt-1">CRM · Loyalty · POS</div>
          </div>
        </div>

        <h1 className="font-display font-bold text-[22px] leading-tight text-[#F2F2F2]">
          Every visit,
          <br />
          <span className="bg-gradient-to-r from-brand-a to-brand-b bg-clip-text text-transparent">remembered.</span>
        </h1>

        <form action={doLogin} className="flex flex-col gap-6">
          <div className="field-dark">
            <input type="email" name="email" id="em" required autoComplete="email" defaultValue="admin@kopilima.my" />
            <label htmlFor="em">Work email</label>
          </div>
          <div className="field-dark">
            <input type="password" name="password" id="pw" required autoComplete="current-password" />
            <label htmlFor="pw">Password</label>
          </div>
          {error && <div className="text-[12px] text-danger -mt-2">Email or password doesn&apos;t match. Try demo1234.</div>}
          <div className="flex justify-between items-center text-[12px] text-[#bdb8b8]">
            <span>Kopi Lima Group workspace</span>
          </div>
          <button className="btn-primary h-10" type="submit">Sign in</button>
        </form>

        <div className="text-[11px] text-[#7a7a7a] text-center">
          Demo login: <b className="text-[#bdb8b8] font-data">admin@kopilima.my / demo1234</b>
        </div>
      </div>
    </div>
  );
}
