import { Nav } from "@/components/marketing/nav";
import { Footer } from "@/components/marketing/footer";
import { SmoothScroll } from "@/components/motion/smooth-scroll";
import { Cursor } from "@/components/motion/cursor";
import { Floating } from "@/components/motion/floating";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SmoothScroll />
      <Cursor />
      <Nav />
      <main>{children}</main>
      <Footer />
      <Floating />
    </>
  );
}
