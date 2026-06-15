import LoginForm from "./LoginForm";

export default function LoginPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] fade-in py-12">
      <div className="text-6xl mb-6">🌙</div>
      <h1 className="font-serif text-3xl tracking-wide mb-2">Dream Keeper</h1>
      <p className="font-serif text-[var(--muted)] text-sm tracking-widest mb-12">
        登 录 后 才 能 收 藏 你 的 梦
      </p>

      <LoginForm />
    </div>
  );
}
