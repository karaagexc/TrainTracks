"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronLeft, ChevronRight, MapPin, Clock, BookOpen } from "lucide-react";
import { Dialog, DialogPortal, DialogOverlay } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Station } from "@/types";
import { getStationBadge, getThemeColors } from "@/utils/stationUtils";
import { STATION_INFO, StationInfoData } from "@/data/stationInfo";
import { LINES } from "@/data/stations";
import * as DialogPrimitive from "@radix-ui/react-dialog";

interface StationInfoModalProps {
    station: Station | null;
    open: boolean;
    onClose: () => void;
}

export function StationInfoModal({ station, open, onClose }: StationInfoModalProps) {
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const [failedImageIndexes, setFailedImageIndexes] = useState<Set<number>>(() => new Set());

    const info: StationInfoData | null = station ? STATION_INFO[station.id] ?? null : null;
    const theme = station ? getThemeColors(station.lineId) : getThemeColors(undefined);
    const badge = station ? getStationBadge(station.lineId, station.order) : '';
    const lineColor = station ? LINES[station.lineId]?.color ?? '#71717a' : '#71717a';
    const hasUsableImages = info ? failedImageIndexes.size < info.images.length : false;

    // Reset state when station changes
    useEffect(() => {
        setCurrentImageIndex(0);
        setFailedImageIndexes(new Set());
    }, [station?.id]);

    // Auto-cycle slideshow
    useEffect(() => {
        if (!info || info.images.length <= 1 || !hasUsableImages) return;
        const interval = setInterval(() => {
            setCurrentImageIndex(prev => {
                for (let offset = 1; offset <= info.images.length; offset += 1) {
                    const nextIndex = (prev + offset) % info.images.length;
                    if (!failedImageIndexes.has(nextIndex)) return nextIndex;
                }
                return prev;
            });
        }, 4500);
        return () => clearInterval(interval);
    }, [failedImageIndexes, hasUsableImages, info]);

    const goToImage = useCallback((dir: 'prev' | 'next') => {
        if (!info) return;
        const step = dir === 'next' ? 1 : -1;

        setCurrentImageIndex(prev => {
            for (let offset = 1; offset <= info.images.length; offset += 1) {
                const nextIndex = (prev + step * offset + info.images.length) % info.images.length;
                if (!failedImageIndexes.has(nextIndex)) return nextIndex;
            }
            return prev;
        });
    }, [failedImageIndexes, info]);

    const handleImageError = useCallback(() => {
        if (!info) return;

        const nextFailedIndexes = new Set(failedImageIndexes);
        nextFailedIndexes.add(currentImageIndex);
        setFailedImageIndexes(nextFailedIndexes);

        const nextImageIndex = info.images.findIndex((_, index) => !nextFailedIndexes.has(index));
        if (nextImageIndex >= 0) {
            setCurrentImageIndex(nextImageIndex);
        }
    }, [currentImageIndex, failedImageIndexes, info]);

    if (!station || !info) return null;

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
            <DialogPortal>
                <DialogOverlay className="bg-black/85 backdrop-blur-sm" />
                <DialogPrimitive.Content
                    className={cn(
                        "fixed left-[50%] top-[50%] z-50 w-[calc(100%-2rem)] max-w-sm translate-x-[-50%] translate-y-[-50%]",
                        "rounded-2xl overflow-hidden shadow-2xl border border-white/10",
                        "bg-zinc-950 text-white",
                        "data-[state=open]:animate-in data-[state=closed]:animate-out",
                        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
                        "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
                        "data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]",
                        "data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]",
                        "duration-300 focus:outline-none"
                    )}
                    aria-describedby="station-modal-description"
                >
                    {/* ─── Close Button ─── */}
                    <button
                        onClick={onClose}
                        className="absolute top-3 right-3 z-50 p-1.5 rounded-full bg-black/50 backdrop-blur-md text-white/80 hover:text-white hover:bg-black/70 transition-all"
                    >
                        <X className="w-4 h-4" />
                    </button>

                    {/* ─── Image Section ─── */}
                    <div className="relative w-full aspect-[16/10] bg-zinc-900 overflow-hidden">
                        <AnimatePresence mode="wait">
                            {hasUsableImages ? (
                                <motion.img
                                    key={`${station.id}-${currentImageIndex}`}
                                    src={info.images[currentImageIndex]}
                                    alt={`${station.name} station`}
                                    className="absolute inset-0 w-full h-full object-cover"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.6 }}
                                    onError={handleImageError}
                                />
                            ) : (
                                <motion.div
                                    key="fallback"
                                    className="absolute inset-0 flex flex-col items-center justify-center gap-2"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    style={{ background: `linear-gradient(135deg, ${lineColor}22, ${lineColor}08)` }}
                                >
                                    <MapPin className="w-10 h-10" style={{ color: lineColor }} />
                                    <span className="text-xs text-white/40">Image unavailable</span>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Slideshow Controls (multiple images) */}
                        {info.images.length > 1 && hasUsableImages && (
                            <>
                                <button
                                    onClick={() => goToImage('prev')}
                                    className="absolute left-2 top-1/2 -translate-y-1/2 z-30 p-1 rounded-full bg-black/40 backdrop-blur-sm text-white/70 hover:text-white hover:bg-black/60 transition-all"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => goToImage('next')}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 z-30 p-1 rounded-full bg-black/40 backdrop-blur-sm text-white/70 hover:text-white hover:bg-black/60 transition-all"
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                                {/* Dots */}
                                <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-30 flex gap-1.5">
                                    {info.images.map((_, i) => (
                                        <button
                                            key={i}
                                            onClick={() => setCurrentImageIndex(i)}
                                            disabled={failedImageIndexes.has(i)}
                                            className={cn(
                                                "w-1.5 h-1.5 rounded-full transition-all duration-300",
                                                i === currentImageIndex
                                                    ? "bg-white scale-125"
                                                    : failedImageIndexes.has(i)
                                                        ? "bg-white/20 cursor-not-allowed"
                                                        : "bg-white/40 hover:bg-white/60"
                                            )}
                                        />
                                    ))}
                                </div>
                            </>
                        )}

                        {/* ─── Gradient Fade Overlay + Station Badge ─── */}
                        <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-zinc-950 via-zinc-950/80 to-transparent z-20" />
                        <div className="absolute bottom-0 left-0 right-0 z-30 px-5 pb-4">
                            <DialogPrimitive.Title className="flex items-center gap-2.5">
                                <span
                                    className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-black tracking-tight text-black"
                                    style={{ backgroundColor: lineColor }}
                                >
                                    {badge}
                                </span>
                                <span className="text-lg font-bold text-white drop-shadow-lg leading-tight">
                                    {station.name}
                                </span>
                            </DialogPrimitive.Title>
                            <p className="text-[10px] font-medium mt-0.5 tracking-wide" style={{ color: lineColor }}>
                                {LINES[station.lineId]?.name}
                                {station.isUnderground && ' • Underground'}
                                {station.transfers && ` • Transfer: ${station.transfers.join(', ')}`}
                            </p>
                        </div>
                    </div>

                    {/* ─── Content Body ─── */}
                    <div id="station-modal-description" className="px-5 py-4 space-y-4 max-h-[40vh] overflow-y-auto custom-scrollbar">
                        {/* Description */}
                        <p className="text-[13px] leading-relaxed text-white/75">
                            {info.description}
                        </p>

                        {/* History */}
                        <div>
                            <div className="flex items-center gap-2 mb-1.5">
                                <Clock className="w-3.5 h-3.5" style={{ color: lineColor }} />
                                <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: lineColor }}>
                                    History
                                </h3>
                            </div>
                            <p className="text-[12px] leading-relaxed text-white/60">
                                {info.history}
                            </p>
                        </div>

                        {/* Name Origin */}
                        <div className="pb-1">
                            <div className="flex items-center gap-2 mb-1.5">
                                <BookOpen className="w-3.5 h-3.5" style={{ color: lineColor }} />
                                <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: lineColor }}>
                                    Name Origin
                                </h3>
                            </div>
                            <p className="text-[12px] leading-relaxed text-white/60">
                                {info.nameOrigin}
                            </p>
                        </div>
                    </div>
                </DialogPrimitive.Content>
            </DialogPortal>
        </Dialog>
    );
}
