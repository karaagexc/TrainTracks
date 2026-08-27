"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
    className?: string;
    text: string;
}

export function Marquee({ className, text }: Props) {
    const containerRef = useRef<HTMLDivElement>(null);
    const textRef = useRef<HTMLSpanElement>(null);
    const [isOverflowing, setIsOverflowing] = useState(false);

    useEffect(() => {
        const container = containerRef.current;
        const textEl = textRef.current;

        if (container && textEl) {
            if (textEl.offsetWidth > container.offsetWidth) {
                setIsOverflowing(true);
            } else {
                setIsOverflowing(false);
            }
        }
    }, [text]);

    return (
        <div
            ref={containerRef}
            className={cn("overflow-hidden whitespace-nowrap w-full mask-gradient-r", className)}
            style={{
                maskImage: isOverflowing ? "linear-gradient(to right, transparent 0%, black 5%, black 95%, transparent 100%)" : "none",
                WebkitMaskImage: isOverflowing ? "linear-gradient(to right, transparent 0%, black 5%, black 95%, transparent 100%)" : "none",
            }}
        >
            <div className={cn("inline-flex", isOverflowing && "animate-marquee")}>
                <span ref={textRef} className="bg-clip-text pr-8">
                    {text}
                </span>
                {isOverflowing && (
                    <span aria-hidden="true" className="pr-8">
                        {text}
                    </span>
                )}
            </div>
        </div>
    );
}
