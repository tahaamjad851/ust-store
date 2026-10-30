import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthCard, AuthCardSkeleton } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";
import { FormAlert } from "@/components/forms/form-alert";
import { MESSAGES } from "@/features/customers/types";

export const metadata: Metadata = { title: "Sign in" };

const NOTICES: Record<string, string> = {
  disabled: MESSAGES.accountDisabled,
  link: MESSAGES.linkExpired,
};

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <AuthCard
      title="Sign in"
      description="Welcome back. Sign in to see your details and saved addresses."
      footer={
        <>
          New here?{" "}
          <Link href="/register" className="font-medium text-brand-deep underline underline-offset-4">
            Create an account
          </Link>
        </>
      }
    >
      <Suspense fallback={<AuthCardSkeleton />}>
        <LoginContent searchParams={searchParams} />
      </Suspense>
    </AuthCard>
  );
}

async function LoginContent({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  const notice = typeof params.error === "string" ? NOTICES[params.error] : undefined;
  return (
    <div className="space-y-4">
      {notice && <FormAlert tone="error">{notice}</FormAlert>}
      <LoginForm next={next} />
    </div>
  );
}
