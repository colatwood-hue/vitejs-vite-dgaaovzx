import { LoginForm } from './LoginForm'
import { site } from '@/lib/site'

export const metadata = { title: 'Sign in' }

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <p className="eyebrow">{site.name} · Studio</p>
      <h1 className="mt-3 font-serif text-4xl">Welcome back.</h1>
      <LoginForm />
    </main>
  )
}
