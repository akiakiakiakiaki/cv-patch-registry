import Box from "@mui/material/Box";
import { ForgotPasswordForm } from "@/components/auth-forms/PasswordResetForms";

export default function ForgotPasswordPage() {
  return (
    <Box component="main" sx={{ minHeight: "100vh", display: "grid", placeContent: "center", justifyItems: "center", p: 2 }}>
      <ForgotPasswordForm />
    </Box>
  );
}
