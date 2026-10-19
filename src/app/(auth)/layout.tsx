/**
 * AuthLayout provides a centered container for authentication pages.
 * Ensures that sign-in, sign-up, and other auth-related components are consistently styled and positioned.
 *
 * @param children - The authentication component (e.g., SignIn, SignUp) to be rendered
 */
export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <div className="min-h-screen w-full flex justify-center items-center">{children}</div>;
}
