import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata: Metadata = { title: "Choose a new password" };

// Reached from the link in the reset email (via /auth/confirm). The action itself checks that the
// visitor really followed that link; opening this page directly just ends in "link expired".
export default function ResetPasswordPage() {
  return (
    <AuthCard title="Choose a new password" description="Pick a password you have not used on this site before.">
      <ResetPasswordForm />
    </AuthCard>
  );
}
