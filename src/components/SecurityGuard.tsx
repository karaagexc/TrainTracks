"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { CopyX, Smartphone, Tablet, Cookie } from "lucide-react";
import { useTripStore } from "@/store/useTripStore";

function isHandheldDevice(): boolean {
    if (typeof window === "undefined") return true;

    const userAgent = navigator.userAgent || navigator.vendor;
    const isMobile = /android|iphone|ipod|iemobile|mobile|blackberry|phone|opera m(ob|in)i/i.test(userAgent);
    const isTablet = /ipad|tablet|playbook|silk/i.test(userAgent);
    const hasTouch = navigator.maxTouchPoints > 0 || "ontouchstart" in window;
    const smallScreen = window.innerWidth <= 1024;

    return isMobile || isTablet || (hasTouch && smallScreen);
}

export function SecurityGuard() {
    const pathname = usePathname();
    const { isDevMode } = useTripStore();
    const isAdmin = pathname?.startsWith("/admin") || pathname?.startsWith("/api-console") || pathname?.startsWith("/docs") || isDevMode;
    const isProduction = process.env.NODE_ENV === "production";

    const [isAllowedDevice, setIsAllowedDevice] = useState(true);
    const [cookiesEnabled, setCookiesEnabled] = useState(true);
    useEffect(() => {
        if (!isProduction || isAdmin) return;

        const refreshChecks = () => {
            setIsAllowedDevice(isHandheldDevice());
            setCookiesEnabled(navigator.cookieEnabled);
        };

        const preventContextMenu = (event: MouseEvent) => {
            if (event.target instanceof Element && event.target.closest('input, textarea, [contenteditable="true"]')) {
                return;
            }
            event.preventDefault();
        };

        const preventKeyShortcuts = (event: KeyboardEvent) => {
            const key = String(event.key ?? "").toLowerCase();
            const blocked =
                key === "f12" ||
                (event.ctrlKey && event.shiftKey && ["i", "j", "c", "k"].includes(key)) ||
                (event.ctrlKey && ["u", "s"].includes(key));

            if (blocked) {
                event.preventDefault();
                event.stopPropagation();
            }
        };

        refreshChecks();
        window.addEventListener("resize", refreshChecks);

        document.addEventListener("contextmenu", preventContextMenu);
        document.addEventListener("keydown", preventKeyShortcuts, true);

        return () => {
            window.removeEventListener("resize", refreshChecks);
            document.removeEventListener("contextmenu", preventContextMenu);
            document.removeEventListener("keydown", preventKeyShortcuts, true);

        };
    }, [isAdmin, isProduction]);

    const devicePolicyBlocked = isProduction && !isAdmin && (!isAllowedDevice || !cookiesEnabled);
    useEffect(() => {
        if (!devicePolicyBlocked) return;
        const appRoot = document.getElementById('traintracks-app-root');
        if (!appRoot) return;
        const previousInert = appRoot.inert;
        const previousAriaHidden = appRoot.getAttribute('aria-hidden');
        const activeControl = document.activeElement;
        if (activeControl instanceof HTMLElement && appRoot.contains(activeControl)) activeControl.blur();
        appRoot.inert = true;
        appRoot.setAttribute('aria-hidden', 'true');
        return () => {
            appRoot.inert = previousInert;
            if (previousAriaHidden === null) appRoot.removeAttribute('aria-hidden');
            else appRoot.setAttribute('aria-hidden', previousAriaHidden);
        };
    }, [devicePolicyBlocked]);

    if (isAdmin || !isProduction) return null;

    if (!isAllowedDevice) {
        return (
            <div className="fixed inset-0 z-[9999] bg-black text-white flex flex-col items-center justify-center p-8 text-center space-y-8 animate-in fade-in duration-500">
                <div className="relative">
                    <div className="absolute inset-0 bg-red-500/20 blur-3xl rounded-full" />
                    <CopyX className="w-24 h-24 text-red-500 relative z-10 animate-pulse" />
                </div>

                <h1 className="text-4xl font-black tracking-tighter uppercase relative z-10">
                    Handheld Device Required
                </h1>

                <p className="text-zinc-400 max-w-md text-lg relative z-10">
                    This app is tuned for phone and tablet layouts. Open it on a handheld device to continue.
                </p>

                <div className="flex gap-4 relative z-10 opacity-50">
                    <Smartphone className="w-8 h-8 text-white" />
                    <Tablet className="w-8 h-8 text-white" />
                </div>

                <div className="absolute bottom-8 text-xs text-zinc-700 font-mono">
                    ERROR_DEVICE_NOT_SUPPORTED
                </div>
            </div>
        );
    }

    if (!cookiesEnabled) {
        return (
            <div className="fixed inset-0 z-[9999] bg-black text-white flex flex-col items-center justify-center p-8 text-center space-y-8 animate-in fade-in duration-500">
                <div className="relative">
                    <div className="absolute inset-0 bg-amber-500/20 blur-3xl rounded-full" />
                    <Cookie className="w-24 h-24 text-amber-500 relative z-10 animate-pulse" />
                </div>

                <h1 className="text-4xl font-black tracking-tighter uppercase relative z-10">
                    Cookies Required
                </h1>

                <p className="text-zinc-400 max-w-md text-lg relative z-10">
                    This app requires cookies to be enabled in your browser to function properly. Enable cookies and reload the page.
                </p>

                <div className="absolute bottom-8 text-xs text-zinc-700 font-mono">
                    ERROR_COOKIES_DISABLED
                </div>
            </div>
        );
    }

    return null;
}
