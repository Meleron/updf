"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Editor } from "@/components/editor/editor";
import { useOpenDocument } from "@/components/open-document";

export default function EditPage() {
  const router = useRouter();
  const { opened } = useOpenDocument();

  useEffect(() => {
    if (!opened) {
      router.replace("/");
    }
  }, [opened, router]);

  return opened ? <Editor document={opened} /> : null;
}
