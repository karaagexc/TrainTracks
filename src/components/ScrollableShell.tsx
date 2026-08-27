"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Routes that need normal scrolling behavior.
 * The root layout locks the body to `overflow:hidden; position:fixed`
 * for the full-screen map experience. This component undoes that
 * lock for pages that are standard scrollable documents.
 */
const SCROLLABLE_ROUTES = ["/api-console", "/docs"];

export function ScrollableShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isScrollable = SCROLLABLE_ROUTES.some((r) => pathname?.startsWith(r));

    useEffect(() => {
        if (!isScrollable) return;

        const body = document.body;
        const wrapper = body.querySelector<HTMLElement>(":scope > div.w-full.h-full");

        // Save originals
        const origBodyOverflow = body.style.overflow;
        const origBodyPosition = body.style.position;
        const origBodyHeight = body.style.height;
        const origWrapperOverflow = wrapper?.style.overflow;

        // Unlock scrolling
        body.style.overflow = "auto";
        body.style.position = "relative";
        body.style.height = "auto";
        body.classList.remove("overflow-hidden");

        if (wrapper) {
            wrapper.style.overflow = "auto";
            wrapper.classList.remove("overflow-hidden");
        }

        return () => {
            // Restore originals on route change
            body.style.overflow = origBodyOverflow;
            body.style.position = origBodyPosition;
            body.style.height = origBodyHeight;
            if (wrapper && origWrapperOverflow !== undefined) {
                wrapper.style.overflow = origWrapperOverflow;
            }
        };
    }, [isScrollable]);

    return <>{children}</>;
}
