import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { RegisterForm } from "@/components/auth/register-form";

export const metadata: Metadata = { title: "Create an account" };

export default function RegisterPage() {
  return (
    <AuthCard
      title="Create an account"
      description="Save your delivery addresses and keep your details for next time. You can still order without an account."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-brand-deep underline underline-offset-4">
            Sign in
          </Link>
        </>
      }
    >
      <RegisterForm />
    </AuthCard>
  );
}
