import { Card } from '../components/ui/Card'

export function MissingFirebase() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center px-6 py-16">
      <Card>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">
          Configure Firebase
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          This app reads configuration from environment variables. Create a{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">.env</code> file
          in the project root (see <code className="font-mono text-xs">.env.example</code>) and add
          your Firebase web app keys from the Firebase console.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          Enable Email/Password authentication, create a Firestore database, and add Storage. Then
          deploy the provided <code className="font-mono text-xs">firestore.rules</code> and{' '}
          <code className="font-mono text-xs">storage.rules</code>.
        </p>
      </Card>
    </div>
  )
}
