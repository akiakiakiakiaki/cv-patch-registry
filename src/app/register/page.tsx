import Box from "@mui/material/Box";
import { AuthForm } from "@/components/auth-forms/AuthForm";

export default function RegisterPage() {
  return (
    <Box component="main" sx={{ minHeight: "100vh", display: "grid", placeContent: "center", justifyItems: "center", p: 2 }}>
      <AuthForm mode="register" />
    </Box>
  );
}
