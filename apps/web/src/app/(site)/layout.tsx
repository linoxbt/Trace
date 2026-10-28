import { Nav } from "@/components/marketing/nav";
import { Footer } from "@/components/marketing/footer";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Nav />
      <main>{children}</main>
      <Footer />
    </>
  );
}
