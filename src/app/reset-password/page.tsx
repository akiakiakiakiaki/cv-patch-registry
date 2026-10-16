import Box from "@mui/material/Box";
import { ResetPasswordForm } from "@/components/auth-forms/PasswordResetForms";

export default function ResetPasswordPage() {
  return (
    <Box component="main" sx={{ minHeight: "100vh", display: "grid", placeContent: "center", justifyItems: "center", p: 2 }}>
      <ResetPasswordForm />
    </Box>
  );
}
