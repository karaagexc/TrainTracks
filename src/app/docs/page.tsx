"use client";

import dynamic from "next/dynamic";

const ApiDocs = dynamic(() => import("@/components/ApiDocs").then((m) => m.ApiDocs), { ssr: false });

export default function DocsPage() {
    return <ApiDocs embedded={false} />;
}
