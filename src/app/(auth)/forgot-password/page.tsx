import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Reset your password"
      description="Enter the email you registered with and we will send you a link to choose a new password."
      footer={
        <Link href="/login" className="font-medium text-brand-deep underline underline-offset-4">
          Back to sign in
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
