/*
 * Nav.tsx — yah.mobile Global Navigation
 * Brand: Black logo on white bg / White logo on dark bg
 * Style: Fixed header, left logo, right spaced-uppercase links + auth button
 */
import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, LogOut, ShoppingBag, User } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useGoogleLogin } from "@/hooks/useGoogleLogin";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useTranslation } from "react-i18next";
import { YahLogo } from "@/components/YahLogo";

// /app ページ上ならスムーズスクロール、それ以外なら /app#section へ遷移
function useNavHandler() {
  const [location] = useLocation();
  const isAppPage = location === "/app" || location === "/" || location.startsWith("/app/");
  const getAppBase = () => (location.startsWith("/app/") ? location : "/app");

  return function handleNavClick(anchor: string) {
    if (!anchor) {
      if (isAppPage) {
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        window.location.href = getAppBase();
      }
      return;
    }
    if (anchor === "buy") {
      if (isAppPage) {
        const url = new URL(window.location.href);
        url.searchParams.set("open", "true");
        window.history.pushState({}, "", url.toString());
        window.dispatchEvent(new PopStateEvent("popstate"));
      } else {
        window.location.href = `${getAppBase()}?open=true`;
      }
      return;
    }
    if (isAppPage) {
      const el = document.getElementById(anchor);
      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 80, behavior: "smooth" });
    } else {
      window.location.href = `${getAppBase()}#${anchor}`;
    }
  };
}

// ---- 認証UI（デスクトップ・モバイル共通） ----

function AuthButton({
  isLight,
  isMobile,
  initials,
  user,
  onLogout,
}: {
  isLight: boolean;
  isMobile?: boolean;
  initials: string;
  user: { name?: string | null; email?: string | null } | null;
  onLogout: () => void;
}) {
  const { t } = useTranslation();
  const [location] = useLocation();
  // ページ遷移せずその場で Google ポップアップログイン（ブロック時のみ /login へフォールバック）
  const { handleLogin, pending } = useGoogleLogin({ fallbackHref: `/login?redirect=${encodeURIComponent(location)}` });

  // アカウントメニュー（デスクトップ・モバイル共通で自己完結）。外側タップで閉じる。
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onOutside = (e: MouseEvent | TouchEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setDropdownOpen(false);
    };
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("touchstart", onOutside);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("touchstart", onOutside);
    };
  }, []);
  // ルート遷移時にメニューを閉じる
  useEffect(() => { setDropdownOpen(false); }, [location]);

  const initialsBtn = (
    <div
      className={`font-sans font-medium w-7 h-7 rounded-full flex items-center justify-center text-[0.625rem] tracking-[0.05em] ${
        isLight ? "bg-black text-white" : "bg-white text-black"
      }`}
    >
      {initials}
    </div>
  );

  if (!user) {
    return (
      <button
        type="button"
        onClick={handleLogin}
        disabled={pending}
        className={`font-sans font-medium text-[0.625rem] tracking-[0.16em] uppercase transition-colors duration-300 bg-transparent cursor-pointer disabled:opacity-60 ${
          isMobile
            ? `p-0 border-0 ${isLight ? "text-black" : "text-white"}`
            : `text-label inline-flex items-center gap-1.5 border px-4 py-2 transition-colors duration-200 hover:opacity-70 ${
                isLight ? "border-black/20 text-black hover:border-black" : "border-white/30 text-white hover:border-white"
              }`
        }`}
      >
        {!isMobile && <User size={11} />}
        {t("nav.login")}
      </button>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className={`transition-opacity hover:opacity-70 ${isLight ? "text-black" : "text-white"}`}
        aria-label="Account menu"
        aria-expanded={dropdownOpen}
      >
        {initialsBtn}
      </button>

      {/* アカウントメニュー（デスクトップ・モバイル共通） */}
      <AnimatePresence>
        {dropdownOpen && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.97 }}
            transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
            className="absolute right-0 top-full mt-2 w-52 bg-white border border-[#D7D7D7] shadow-lg py-1 z-50"
            style={{ transformOrigin: "top right" }}
          >
            <div className="px-4 py-3 border-b border-[#E8E8E8]">
              <p className="font-sans text-black text-sm truncate">{user.name || "My Account"}</p>
              {user.email && (
                <p className="font-sans text-black/40 text-[0.75rem] truncate mt-0.5">{user.email}</p>
              )}
            </div>
            <Link href="/mypage">
              <span
                onClick={() => setDropdownOpen(false)}
                className="font-sans w-full flex items-center gap-2.5 px-4 py-2.5 text-black/60 hover:text-black hover:bg-[#F7F7F7] transition-colors cursor-pointer text-[0.8125rem]"
              >
                <ShoppingBag size={13} />
                {t("nav.myOrders")}
              </span>
            </Link>
            <button
              onClick={onLogout}
              className="font-sans w-full flex items-center gap-2.5 px-4 py-2.5 text-black/60 hover:text-black hover:bg-[#F7F7F7] transition-colors text-left text-[0.8125rem]"
            >
              <LogOut size={13} />
              {t("nav.signOut")}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---- メインコンポーネント ----

export default function Nav() {
  const { t } = useTranslation();
  const [location] = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const { user, loading, isAuthenticated, logout } = useAuth();
  const handleNavClick = useNavHandler();

  const navLinks = [
    { label: t("nav.home"),    anchor: "" },
    { label: t("nav.buy"),     anchor: "buy" },
    { label: t("nav.plans"),   anchor: "plans" },
    { label: t("nav.faq"),     anchor: "faq" },
    { label: t("nav.chat"),    anchor: "chat" },
    { label: t("nav.contact"), anchor: "contact" },
  ];

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => { setMenuOpen(false); }, [location]);

  const isDarkHero = location === "/app" || location === "/" || location.startsWith("/app/");
  const isLight = scrolled || !isDarkHero;

  const handleLogout = async () => { await logout(); };

  const initials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "U";

  const authProps = {
    isLight,
    initials,
    user: isAuthenticated && user ? user : null,
    onLogout: handleLogout,
  };

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          isLight ? "bg-white/96 backdrop-blur-md border-b border-[#D7D7D7]" : "bg-transparent"
        }`}
      >
        <div className="container flex items-center justify-between h-16 lg:h-20">
          {/* Logo */}
          <Link href="/app">
            <YahLogo variant={isLight ? "dark" : "light"} className="h-9 lg:h-11 w-auto transition-all duration-300" />
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <button
                key={link.label}
                onClick={() => handleNavClick(link.anchor)}
                className={`text-label transition-colors duration-300 hover:opacity-50 bg-transparent border-none cursor-pointer ${
                  isLight ? "text-black" : "text-white"
                }`}
              >
                {link.label}
              </button>
            ))}
            {!loading && <AuthButton {...authProps} />}
            <LanguageSwitcher />
          </nav>

          {/* Mobile: auth icon + hamburger */}
          <div className="md:hidden flex items-center gap-3">
            {!loading && <AuthButton {...authProps} isMobile />}
            <LanguageSwitcher />
            <button
              className={`transition-colors duration-300 ${isLight ? "text-black" : "text-white"}`}
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Toggle menu"
            >
              {menuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile menu overlay */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
            className="fixed inset-0 z-50 bg-white flex flex-col"
          >
            <div className="container flex items-center justify-between h-16">
              <YahLogo variant="dark" className="h-7 w-auto" />
              <button onClick={() => setMenuOpen(false)} aria-label="Close menu">
                <X size={18} />
              </button>
            </div>
            <nav className="container flex flex-col pt-8">
              {navLinks.map((link, i) => (
                <motion.div
                  key={link.label}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.07, duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                >
                  <button
                    onClick={() => { handleNavClick(link.anchor); setMenuOpen(false); }}
                    className="font-sans w-full text-left block py-5 border-b border-[#D7D7D7] text-black hover:opacity-40 transition-opacity bg-transparent border-x-0 border-t-0 cursor-pointer text-[1.125rem] tracking-[0.08em]"
                  >
                    {link.label}
                  </button>
                </motion.div>
              ))}

              {/* Mobile: my orders + sign out */}
              {isAuthenticated && user && (
                <>
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: navLinks.length * 0.07, duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                  >
                    <Link href="/mypage">
                      <span className="font-sans block py-5 border-b border-[#D7D7D7] text-black hover:opacity-40 transition-opacity text-[1.125rem] tracking-[0.08em]">
                        {t("nav.myOrders")}
                      </span>
                    </Link>
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: navLinks.length * 0.07, duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                  >
                    <button
                      onClick={handleLogout}
                      className="font-sans w-full flex items-center gap-3 py-4 border-b border-[#D7D7D7] text-black/35 hover:text-black transition-colors text-left text-[0.75rem] tracking-[0.1em] uppercase"
                    >
                      {t("nav.signOut")}
                    </button>
                  </motion.div>
                </>
              )}

              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: (navLinks.length + 1) * 0.07, duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                className="pt-6"
              >
                <LanguageSwitcher />
              </motion.div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
