import { Check, Link, QrCode, Share2, X } from "lucide-react";
import qrcode from "qrcode-generator";
import { useMemo, useState } from "react";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

interface ShareMenuProps {
  /** Absolute URL to share (see `buildDeepLinkUrl`). */
  url: string;
  title: string;
  label?: string;
}

function QrCodeSvg({ value }: { value: string }) {
  const svg = useMemo(() => {
    const code = qrcode(0, "M");
    code.addData(value);
    code.make();
    return code.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  }, [value]);

  return (
    <div
      role="img"
      aria-label="QR code"
      className="mx-auto size-44 rounded-md bg-white p-1 [&_svg]:size-full"
      // qrcode-generator emits a self-contained <svg> built from `value`
      // characters only as module data, never as markup.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export default function ShareMenu({ url, title, label }: ShareMenuProps) {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const canNativeShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("[oim] failed to copy link:", error);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size={label ? "sm" : "icon"}
            aria-label={label ?? "Share"}
            className="rounded-full p-2 hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            {copied ? <Check size={16} /> : <Share2 size={16} />}
            {label && <span>{copied ? "Copied" : label}</span>}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setShowQr(true)}>
            <QrCode className="mr-2 size-4" />
            <span>QR Code</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={copyLink}>
            <Link className="mr-2 size-4" />
            <span>Copy Link</span>
          </DropdownMenuItem>
          {canNativeShare && (
            <DropdownMenuItem
              onClick={() => navigator.share({ title, url }).catch(() => {})}
            >
              <Share2 className="mr-2 size-4" />
              <span>Share…</span>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {showQr && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) setShowQr(false);
          }}
          onKeyDown={(event) => event.key === "Escape" && setShowQr(false)}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Scan to open on your phone"
            className="w-64 rounded-xl bg-white p-4 shadow-2xl dark:bg-card"
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium">Scan to open on your phone</p>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close QR code"
                onClick={() => setShowQr(false)}
                className="size-7 rounded-full"
              >
                <X size={14} />
              </Button>
            </div>
            <QrCodeSvg value={url} />
            <p className="mt-2 truncate text-center text-xs text-muted-foreground">
              {title}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
