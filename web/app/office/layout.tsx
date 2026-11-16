import "../team/studio.css";
export const metadata = {
  title: "Workspace",
  robots: { index: false, follow: false },
};
export default function OfficeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
