import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { useAuth } from "./auth";

function fileToBase64(file: File): Promise<{ dataBase64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") { reject(new Error("Could not read the file.")); return; }
      const comma = result.indexOf(",");
      resolve({ dataBase64: comma >= 0 ? result.slice(comma + 1) : result, mimeType: file.type });
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });
}
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useDeferredValue, useEffect, useRef, useState, type ReactNode } from "react";
import { api, type ApiResponse } from "./api";
import rimaLogo from "./assets/rima-logo.jpg";

type Product = ApiResponse<typeof api, "listProducts">["products"][number];
type Customer = ApiResponse<typeof api, "listCustomers">["customers"][number];
type CustomerDraft = Omit<Customer, "id" | "tax_rate_bps" | "tax_rate_source" | "balance_cents" | "open_wishlist_count" | "created_at">;
type WishlistItem = Account["wishlist"][number];
type Account = ApiResponse<typeof api, "getCustomerAccount">;
type CustomerPreferences = ApiResponse<typeof api, "getCustomerPreferences">;
type PreferenceItem = CustomerPreferences["most_bought"][number];
type ManualPreference = CustomerPreferences["manual"][number];
type View = "inventory" | "products" | "customers" | "checkout" | "settings" | "field" | "analytics" | "orders" | "markup" | "team" | "returns" | "salesorders" | "statements" | "deposits" | "users" | "help" | "tasks" | "accounting";
type DepositReport = ApiResponse<typeof api, "getDepositReport">;
type FieldOrder = ApiResponse<typeof api, "listFieldOrders">["orders"][number];
type Mode = "all" | "reorder";
type CartLine = { product: Product; quantity: number };
type BarcodeDetectorLike = { detect(source: HTMLVideoElement): Promise<Array<{ rawValue: string }>> };
type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

function Icon({ children, size = 20 }: { children: ReactNode; size?: number }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>;
}
const SearchIcon = () => <Icon><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></Icon>;
const ScanIcon = () => <Icon><path d="M3 7V4a1 1 0 0 1 1-1h3M17 3h3a1 1 0 0 1 1 1v3M21 17v3a1 1 0 0 1-1 1h-3M7 21H4a1 1 0 0 1-1-1v-3M7 12h10" /></Icon>;
const CloseIcon = () => <Icon><path d="m6 6 12 12M18 6 6 18" /></Icon>;
const MinusIcon = () => <Icon size={18}><path d="M5 12h14" /></Icon>;
const PlusIcon = () => <Icon size={18}><path d="M12 5v14M5 12h14" /></Icon>;
const ChevronIcon = () => <Icon size={18}><path d="m9 18 6-6-6-6" /></Icon>;
const UserIcon = () => <Icon><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></Icon>;
const CartIcon = () => <Icon><path d="M3 4h2l2.2 10.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 1.9-1.4L21 8H7" /><circle cx="10" cy="20" r="1" /><circle cx="18" cy="20" r="1" /></Icon>;
const BoxIcon = () => <Icon><path d="m4 7 8-4 8 4-8 4-8-4Z" /><path d="M4 7v10l8 4 8-4V7M12 11v10" /></Icon>;
const TagIcon = () => <Icon><path d="M20 13 11 22l-9-9V2h11l7 7a3 3 0 0 1 0 4Z" /><circle cx="7" cy="7" r="1" /></Icon>;
const UploadIcon = () => <Icon><path d="M12 16V4m-5 5 5-5 5 5M4 20h16" /></Icon>;
const SettingsIcon = () => <Icon><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08A1.7 1.7 0 0 0 9 19.37a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.63 15 1.7 1.7 0 0 0 3.08 14H3v-4h.08A1.7 1.7 0 0 0 4.63 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.63 1.7 1.7 0 0 0 10 3.08V3h4v.08A1.7 1.7 0 0 0 15 4.63a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.37 9a1.7 1.7 0 0 0 1.55 1H21v4h-.08A1.7 1.7 0 0 0 19.4 15Z" /></Icon>;
const MailIcon = () => <Icon size={18}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></Icon>;
const MessageIcon = () => <Icon size={18}><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" /></Icon>;
const DownloadIcon = () => <Icon size={18}><path d="M12 3v12m-5-5 5 5 5-5M4 21h16" /></Icon>;
const PrinterIcon = () => <Icon size={18}><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="7" /></Icon>;
const ClipboardIcon = () => <Icon><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4.5V3h6v1.5M9 11h6M9 15h4" /></Icon>;
const ReturnIcon = () => <Icon size={18}><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></Icon>;
const BackIcon = () => <Icon size={18}><path d="m14 6-6 6 6 6" /></Icon>;
const HeartIcon = () => <Icon size={18}><path d="M19.5 12.6 12 20l-7.5-7.4A5 5 0 1 1 12 6.2a5 5 0 1 1 7.5 6.4Z" /></Icon>;
const PinIcon = () => <Icon size={18}><path d="M12 17v5" /><path d="M9 10.8a2 2 0 0 1-1.1 1.8l-1.8.9A2 2 0 0 0 5 15.2V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.8a2 2 0 0 0-1.1-1.7l-1.8-.9A2 2 0 0 1 15 10.8V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1Z" /></Icon>;
const StarIcon = () => <Icon size={18}><path d="m12 3 2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 16.9 6.6 19.8l1.1-6.1L3.2 9.4l6.1-.8L12 3Z" /></Icon>;
const CheckIcon = () => <Icon size={18}><path d="m4 12.5 5 5L20 6.5" /></Icon>;
const ChartIcon = () => <Icon><path d="M4 20V10M10 20V4M16 20v-8M22 20H2" /></Icon>;
const TrashIcon = () => <Icon size={16}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5" /></Icon>;
const TruckIcon = () => <Icon><path d="M2 6h12v10H2zM14 10h4l3 3v3h-7z" /><circle cx="6.5" cy="18.5" r="1.6" /><circle cx="17" cy="18.5" r="1.6" /></Icon>;
const MenuIcon = () => <Icon><path d="M4 7h16M4 12h16M4 17h16" /></Icon>;
const CollapseIcon = () => <Icon size={18}><path d="m14 6-6 6 6 6" /><path d="M20 5v14" /></Icon>;
const ExpandIcon = () => <Icon size={18}><path d="m10 6 6 6-6 6" /><path d="M4 5v14" /></Icon>;
const FileIcon = () => <Icon><path d="M6 2h8l4 4v16H6Z" /><path d="M14 2v4h4M9 12h6M9 16h6" /></Icon>;
const DepositIcon = () => <Icon><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.6" /><path d="M5.5 9.5h.01M18.5 14.5h.01" /></Icon>;
const HelpIcon = () => <Icon><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 0 1 5 .2c0 1.7-2.5 2.1-2.5 3.8M12 17h.01" /></Icon>;
const MicIcon = () => <Icon size={18}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></Icon>;
const TasksIcon = () => <Icon><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="1" /><path d="m9 14 2 2 4-4" /></Icon>;
const AccountingIcon = () => <Icon><path d="M12 2v20M17 6.5c0-2-2.2-3-5-3s-5 1-5 3 2.2 2.6 5 3.2 5 1.4 5 3.3-2.2 3-5 3-5-1-5-3" /></Icon>;

function money(cents: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100); }
function percent(basisPoints: number) { return `${(basisPoints / 100).toFixed(2)}%`; }
function stateTaxRateBps(state: string): number | null {
  const normalized = state.trim().toUpperCase().replaceAll(".", "");
  if (normalized === "RI" || normalized === "RHODE ISLAND") return 700;
  if (normalized === "MA" || normalized === "MASSACHUSETTS") return 625;
  return null;
}
function taxDescription(customer: Customer): string {
  if (customer.tax_status === "exempt") return "Tax exempt";
  if (customer.tax_rate_source === "override") return `${percent(customer.tax_rate_bps)} manual rate`;
  if (customer.tax_rate_source === "state") return `${percent(customer.tax_rate_bps)} state rate`;
  return "No state rate configured";
}
function when(value: string) { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value)); }
function shortDate(value: string) { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value)); }

function SearchField({ value, onChange, placeholder, label }: { value: string; onChange: (value: string) => void; placeholder: string; label: string }) {
  return <label className="search-box"><span className="sr-only">{label}</span><SearchIcon /><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} aria-label={label} />{value ? <button type="button" onClick={() => onChange("")} aria-label={`Clear ${label.toLowerCase()}`}><CloseIcon /></button> : null}</label>;
}

function Scanner({ onClose, onFound }: { onClose: () => void; onFound: (barcode: string) => Promise<boolean> }) {
  const [barcode, setBarcode] = useState("");
  const [error, setError] = useState("");
  const [cameraActive, setCameraActive] = useState(false);
  const [looking, setLooking] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const detectingRef = useRef(false);
  const stopCamera = useCallback(() => { if (frameRef.current !== null) cancelAnimationFrame(frameRef.current); streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null; frameRef.current = null; setCameraActive(false); }, []);
  useEffect(() => stopCamera, [stopCamera]);
  const lookup = async (value: string) => { const clean = value.trim(); if (!clean || looking) return; setLooking(true); setError(""); const found = await onFound(clean).catch(() => false); setLooking(false); if (!found) setError(`No product found for ${clean}.`); };
  const startCamera = async () => {
    setError("");
    const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
    if (!Detector || !navigator.mediaDevices?.getUserMedia) { setError("Camera barcode detection is not supported here. Use the barcode field or a Bluetooth scanner."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream; if (!videoRef.current) return; videoRef.current.srcObject = stream; await videoRef.current.play(); setCameraActive(true);
      const detector = new Detector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39"] });
      const detect = async () => { if (!videoRef.current || !streamRef.current) return; if (!detectingRef.current) { detectingRef.current = true; try { const results = await detector.detect(videoRef.current); const first = results[0]?.rawValue; if (first) { stopCamera(); setBarcode(first); await lookup(first); detectingRef.current = false; return; } } catch { setError("Could not read that barcode. Hold it steady or enter it below."); } detectingRef.current = false; } frameRef.current = requestAnimationFrame(detect); };
      frameRef.current = requestAnimationFrame(detect);
    } catch { setError("Camera access was not granted. Use the barcode field or a Bluetooth scanner."); stopCamera(); }
  };
  return <div className="sheet-backdrop scanner-backdrop" role="presentation"><section className="scan-sheet" role="dialog" aria-modal="true" aria-labelledby="scan-title"><header className="sheet-header"><div><p>BARCODE</p><h2 id="scan-title">Find a product</h2></div><button className="icon-button" onClick={() => { stopCamera(); onClose(); }} aria-label="Close scanner"><CloseIcon /></button></header><div className={`camera-frame ${cameraActive ? "active" : ""}`}><video ref={videoRef} muted playsInline aria-label="Camera barcode preview" /><div className="scan-line" />{!cameraActive ? <button className="camera-start" onClick={startCamera}><ScanIcon /> Use phone camera</button> : <button className="camera-stop" onClick={stopCamera}>Stop camera</button>}</div><div className="or-divider"><span>or scan / type below</span></div><form className="barcode-form" onSubmit={(event) => { event.preventDefault(); void lookup(barcode); }}><label htmlFor="barcode-entry">Barcode</label><div><input id="barcode-entry" autoFocus inputMode="numeric" autoComplete="off" value={barcode} onChange={(event) => setBarcode(event.target.value)} placeholder="Scan with Bluetooth or type" /><button type="submit" className="primary-button" disabled={looking || !barcode.trim()}>{looking ? "Looking…" : "Find"}</button></div></form>{error ? <p className="scan-error" role="alert">{error}</p> : null}</section></div>;
}

function plainDescriptionText(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p\s*>/gi, "\n\n")
    .replace(/<\/li\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function productImages(product: Product): string[] {
  const fromList = (product.image_urls ?? product.images ?? []).filter((url) => typeof url === "string" && url.trim());
  const gallery: string[] = [];
  for (const url of fromList) if (!gallery.includes(url)) gallery.push(url);
  if (product.thumbnail_url && !gallery.includes(product.thumbnail_url)) gallery.unshift(product.thumbnail_url);
  return gallery;
}

function ProductGallery({ images, title }: { images: string[]; title: string }) {
  const [selected, setSelected] = useState(0);
  if (images.length === 0) return null;
  const active = images[Math.min(selected, images.length - 1)] ?? images[0];
  return <div className="product-gallery">
    <div className="gallery-main"><img src={active} alt={title} /></div>
    {images.length > 1 ? <div className="gallery-thumbs" role="list" aria-label={`${title} photos`}>{images.map((url, index) => <button key={`${url}-${index}`} type="button" className={index === Math.min(selected, images.length - 1) ? "gallery-thumb active" : "gallery-thumb"} onClick={() => setSelected(index)} aria-label={`Show photo ${index + 1} of ${images.length} for ${title}`} aria-pressed={index === Math.min(selected, images.length - 1)}><img src={url} alt="" /></button>)}</div> : null}
    {images.length > 1 ? <p className="gallery-count">{images.length} photos</p> : null}
  </div>;
}

function ProductTags({ tags }: { tags: string[] }) {
  const clean = (tags ?? []).map((tag) => tag.trim()).filter(Boolean);
  if (clean.length === 0) return null;
  return <div className="product-tags" aria-label="Product tags">{clean.map((tag) => <span key={tag} className="tag-chip"><TagIcon />{tag}</span>)}</div>;
}

function ProductFullDescription({ product }: { product: Product }) {
  const full = plainDescriptionText(product.description || product.full_description || "");
  const short = (product.short_description || "").trim();
  if (!full && (!short || short === product.title)) return null;
  return <section className="product-description" aria-label="Product description">
    <h3>Description</h3>
    {short && short !== product.title ? <p className="product-short-description">{short}</p> : null}
    {full ? full.split(/\n{2,}/).map((paragraph, index) => <p key={index}>{paragraph.split("\n").map((line, lineIndex) => <span key={lineIndex}>{lineIndex > 0 ? <br /> : null}{line}</span>)}</p>) : null}
  </section>;
}

function ProductEditor({ product, onClose }: { product: Product; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [quantity, setQuantity] = useState(String(product.quantity));
  const [inbound, setInbound] = useState(String(product.inbound_qty));
  const [par, setPar] = useState(String(product.par_level));
  const [message, setMessage] = useState("");
  const save = useMutation({ mutationFn: () => api.updateStockSettings({ id: product.id, quantity: Math.max(0, Number.parseInt(quantity || "0", 10)), inbound_qty: Math.max(0, Number.parseInt(inbound || "0", 10)), par_level: Math.max(0, Number.parseInt(par || "0", 10)) }), onSuccess: async (result) => { if (!result.ok) { setMessage(result.error ?? "Could not save changes."); return; } await queryClient.invalidateQueries(); onClose(); }, onError: () => setMessage("Could not save changes. Try again.") });
  return <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="detail-sheet" role="dialog" aria-modal="true" aria-labelledby="product-detail-title"><div className="sheet-handle" /><header className="sheet-header"><div><p>{product.vendor}</p><h2 id="product-detail-title">{product.title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close product details"><CloseIcon /></button></header><ProductGallery images={productImages(product)} title={product.title} /><div className="detail-meta detail-meta-wide"><span><b>Barcode</b>{product.barcode ?? "Not assigned"}</span><span><b>List / MSRP</b>{product.msrp_cents > 0 ? money(product.msrp_cents) : "—"}</span><span><b>Customer price</b>{money(product.price_cents)}</span><span><b>Cost</b>{money(product.cost_cents)}</span></div><ProductTags tags={product.tags ?? []} /><ProductFullDescription product={product} /><form onSubmit={(event) => { event.preventDefault(); setMessage(""); save.mutate(); }} className="stock-form"><label><span>On hand</span><input aria-label="On-hand quantity" inputMode="numeric" type="number" min="0" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label><label><span>Par level</span><input aria-label="Par level" inputMode="numeric" type="number" min="0" value={par} onChange={(event) => setPar(event.target.value)} /><small>Set to 0 to stop reorder flags.</small></label><label><span>Inbound / on order</span><input aria-label="Inbound quantity already on order" inputMode="numeric" type="number" min="0" value={inbound} onChange={(event) => setInbound(event.target.value)} /><small>Already coming on an open order. The PO generator subtracts this so it never reorders what's on its way.</small></label>{message ? <p className="form-error" role="alert">{message}</p> : null}<button className="primary-button save-button" type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save stock settings"}</button></form></section></div>;
}

function InventoryView() {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>("all"); const [search, setSearch] = useState(""); const deferred = useDeferredValue(search); const [selectedId, setSelectedId] = useState<number | null>(null); const [scannerOpen, setScannerOpen] = useState(false); const [notice, setNotice] = useState("");
  const stats = useQuery({ queryKey: ["inventory-stats"], queryFn: () => api.getInventoryStats({}) });
  const products = useQuery({ queryKey: ["products", mode, deferred], queryFn: () => api.listProducts({ query: deferred, mode, limit: 100, offset: 0 }) });
  const selected = useQuery({ queryKey: ["product", selectedId], queryFn: () => api.getProduct({ id: selectedId ?? 0 }), enabled: selectedId !== null });
  const adjust = useMutation({ mutationFn: ({ id, delta }: { id: number; delta: number }) => api.adjustQuantity({ id, delta }), onSuccess: async () => { await queryClient.invalidateQueries(); }, onError: () => setNotice("Could not update quantity. Try again.") });
  const barcode = async (value: string) => { const result = await api.findByBarcode({ barcode: value }); if (!result.product) return false; setScannerOpen(false); setSelectedId(result.product.id); return true; };
  return <><section className="command-deck"><div className="count-strip"><div><strong>{stats.data?.total.toLocaleString() ?? "—"}</strong><span>products</span></div><div className="warning-stat"><strong>{stats.data?.below_par.toLocaleString() ?? "—"}</strong><span>below par</span></div><button onClick={() => setMode("reorder")}>Open list <ChevronIcon /></button></div><div className="search-row"><SearchField value={search} onChange={setSearch} placeholder="Search name, vendor, or barcode" label="Search products" /><button className="scan-button" onClick={() => setScannerOpen(true)}><ScanIcon /><span>Scan</span></button></div></section><nav className="mode-tabs" aria-label="Inventory views"><button className={mode === "all" ? "active" : ""} onClick={() => setMode("all")}>All products</button><button className={mode === "reorder" ? "active" : ""} onClick={() => setMode("reorder")}>Reorder <span>{stats.data?.below_par ?? 0}</span></button></nav><section className="inventory-section"><div className="section-heading"><div><p>{mode === "reorder" ? "LOW STOCK" : search ? "SEARCH RESULTS" : "STOCK LIST"}</p><h1>{mode === "reorder" ? "Reorder queue" : search ? `Matches for “${search}”` : "Shelf inventory"}</h1></div><span>{products.data?.total.toLocaleString() ?? "—"} items</span></div>{notice ? <div className="notice">{notice}</div> : null}{products.isPending ? <div className="loading-list"><span /><span /><span /></div> : null}{products.data?.products.length === 0 ? <div className="empty-state"><h2>No products found</h2><p>Try a shorter name or enter the exact barcode.</p></div> : null}<div className="product-list">{products.data?.products.map((product) => { const low = product.par_level > 0 && product.quantity + product.inbound_qty < product.par_level; return <article key={product.id} className={`product-row ${low ? "is-low" : ""}`}><button className="product-main" onClick={() => setSelectedId(product.id)}><span className="product-copy"><strong>{product.title}</strong><span>{product.vendor}{product.barcode ? ` · ${product.barcode}` : " · No barcode"}{product.inbound_qty > 0 ? ` · ${product.inbound_qty} inbound` : ""}{product.msrp_cents > 0 ? ` · List ${money(product.msrp_cents)}` : ""}{(product.tags ?? []).length ? ` · ${(product.tags ?? []).join(", ")}` : ""}</span></span>{low ? <span className="shortage-chip">Order {product.shortage}</span> : null}</button><div className="stock-controls"><button className="step-button" disabled={adjust.isPending || product.quantity === 0} onClick={() => adjust.mutate({ id: product.id, delta: -1 })} aria-label={`Decrease ${product.title}`}><MinusIcon /></button><button className="stock-number" onClick={() => setSelectedId(product.id)}><span>{product.quantity}</span><small>{product.par_level > 0 ? `par ${product.par_level}` : "no par"}</small></button><button className="step-button plus" disabled={adjust.isPending} onClick={() => adjust.mutate({ id: product.id, delta: 1 })} aria-label={`Increase ${product.title}`}><PlusIcon /></button></div><button className="row-open" onClick={() => setSelectedId(product.id)} aria-label={`Open ${product.title}`}><ChevronIcon /></button></article>; })}</div></section>{scannerOpen ? <Scanner onClose={() => setScannerOpen(false)} onFound={barcode} /> : null}{selectedId !== null && selected.data?.product ? <ProductEditor product={selected.data.product} onClose={() => setSelectedId(null)} /> : null}</>;
}

type ProductDraft = {
  title: string; short_description: string; description: string; tags_text: string; image_urls_text: string; vendor: string; part_number: string; sku: string; medco_part_number: string; oak_part_number: string; barcode: string;
  medco_cost: string; oak_cost: string; medco_moq: string; oak_moq: string; medco_available: boolean; oak_available: boolean;
  msrp: string; customer_price: string; cost: string; markup: string; quantity: string; status: "active" | "draft";
};

function cents(value: string) { const amount = Number(value); return Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100)) : 0; }
function decimal(centsValue: number) { return (centsValue / 100).toFixed(2); }
function markupFrom(costValue: string, priceValue: string) { const costAmount = Number(costValue); const priceAmount = Number(priceValue); return costAmount > 0 && Number.isFinite(priceAmount) ? (((priceAmount - costAmount) / costAmount) * 100).toFixed(2) : "0.00"; }

function ProductPricingForm({ product, onClose }: { product?: Product; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ProductDraft>(() => ({
    title: product?.title ?? "", short_description: product?.short_description ?? "", description: product ? plainDescriptionText(product.description || product.full_description || "") : "", tags_text: product ? (product.tags ?? []).join(", ") : "", image_urls_text: product ? productImages(product).join("\n") : "", vendor: product?.vendor ?? "",
    part_number: product?.part_number ?? "", sku: product?.sku ?? "", medco_part_number: product?.medco_part_number ?? "", oak_part_number: product?.oak_part_number ?? "", barcode: product?.barcode ?? "",
    medco_cost: decimal(product?.medco_cost_cents ?? 0), oak_cost: decimal(product?.oak_cost_cents ?? 0),
    medco_moq: String(product?.medco_moq ?? 1), oak_moq: String(product?.oak_moq ?? 1),
    medco_available: product?.medco_available ?? true, oak_available: product?.oak_available ?? true,
    msrp: decimal(product?.msrp_cents ?? 0), customer_price: decimal(product?.price_cents ?? 0), cost: decimal(product?.cost_cents ?? 0),
    markup: ((product?.markup_bps ?? 0) / 100).toFixed(2), quantity: String(product?.quantity ?? 0), status: product?.status ?? "active",
  }));
  const [error, setError] = useState("");
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(product?.thumbnail_url ?? null);
  const set = (key: keyof ProductDraft, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const payload = () => ({
    title: form.title, short_description: form.short_description, description: form.description, tags: form.tags_text.split(",").map((tag) => tag.trim()).filter(Boolean), image_urls: form.image_urls_text.split(/\n+/).map((line) => line.trim()).filter((line) => /^https?:\/\//i.test(line)), vendor: form.vendor, part_number: form.part_number, sku: form.sku,
    medco_part_number: form.medco_part_number, oak_part_number: form.oak_part_number,
    medco_cost_cents: cents(form.medco_cost), oak_cost_cents: cents(form.oak_cost),
    medco_moq: Math.max(1, Number.parseInt(form.medco_moq || "1", 10) || 1), oak_moq: Math.max(1, Number.parseInt(form.oak_moq || "1", 10) || 1),
    medco_available: form.medco_available, oak_available: form.oak_available,
    barcode: form.barcode.trim() || null, msrp_cents: cents(form.msrp), price_cents: cents(form.customer_price), cost_cents: cents(form.cost),
    markup_bps: Math.round((Number(form.markup) || 0) * 100), status: form.status,
  });
  const save = useMutation({
    mutationFn: () => product ? api.updateProductPricing({ id: product.id, ...payload() }) : api.createProduct({ ...payload(), quantity: Math.max(0, Number.parseInt(form.quantity || "0", 10) || 0) }),
    onSuccess: async (result) => { if (!result.ok || !result.product) { setError(result.error ?? "Could not save product."); return; } if (thumbnail) { const encoded = await fileToBase64(thumbnail); if (!(["image/jpeg", "image/png", "image/webp"] as string[]).includes(encoded.mimeType)) { setError("Thumbnail must be a JPEG, PNG, or WebP image."); return; } const uploaded = await api.setProductThumbnail({ id: result.product.id, data_base64: encoded.dataBase64, mime_type: encoded.mimeType as "image/jpeg" | "image/png" | "image/webp" }); if (!uploaded.ok) { setError(uploaded.error ?? "Product saved, but the thumbnail could not be uploaded."); return; } } await queryClient.invalidateQueries(); onClose(); },
    onError: () => setError("Could not save product. Try again."),
  });
  const updateMarkup = (value: string) => {
    setForm((current) => { const costAmount = Number(current.cost); const markupAmount = Number(value); return { ...current, markup: value, customer_price: costAmount > 0 && Number.isFinite(markupAmount) ? (costAmount * (1 + markupAmount / 100)).toFixed(2) : current.customer_price }; });
  };
  const updatePrice = (value: string) => setForm((current) => ({ ...current, customer_price: value, markup: markupFrom(current.cost, value) }));
  const updateCost = (value: string) => setForm((current) => { const costAmount = Number(value); const markupAmount = Number(current.markup); return { ...current, cost: value, customer_price: costAmount > 0 && Number.isFinite(markupAmount) ? (costAmount * (1 + markupAmount / 100)).toFixed(2) : current.customer_price }; });
  return <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="pricing-sheet" role="dialog" aria-modal="true" aria-labelledby="pricing-form-title"><div className="sheet-handle" /><header className="sheet-header"><div><p>{product ? "PRODUCT PRICING" : "NEW PRODUCT"}</p><h2 id="pricing-form-title">{product ? product.title : "Add an item"}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close product form"><CloseIcon /></button></header><form className="pricing-form" onSubmit={(event) => { event.preventDefault(); setError(""); save.mutate(); }}><fieldset><legend>Product details</legend><div className="form-grid"><label className="wide-field"><span>Product name *</span><input required value={form.title} onChange={(event) => set("title", event.target.value)} /></label><label className="wide-field"><span>Short description</span><input value={form.short_description} onChange={(event) => set("short_description", event.target.value)} placeholder="What staff sees on the line" /></label><label className="wide-field full-description-field"><span>Full description</span><textarea aria-label="Full description" value={form.description} onChange={(event) => set("description", event.target.value)} placeholder="Complete product description from Shopify — shown in full on the product detail page" rows={7} /><small>The complete text, not truncated. Short description above stays the short version.</small></label><label><span>Vendor / brand</span><input value={form.vendor} onChange={(event) => set("vendor", event.target.value)} /></label><label><span>Part number</span><input value={form.part_number} onChange={(event) => set("part_number", event.target.value)} /></label><label><span>SKU</span><input value={form.sku} onChange={(event) => set("sku", event.target.value)} /></label><label><span>Barcode</span><input value={form.barcode} onChange={(event) => set("barcode", event.target.value)} /></label><label className="wide-field"><span>Tags</span><input aria-label="Product tags" value={form.tags_text} onChange={(event) => set("tags_text", event.target.value)} placeholder="e.g. tape, 3M, best seller — separated by commas" /><small>Reused from Shopify Tags where available. Separate tags with commas.</small></label></div></fieldset><fieldset><legend>Supplier cross-reference</legend><p className="field-note crossref-note">Leave a supplier number blank when that warehouse does not carry the item. The Tuesday PO generator compares each warehouse's cost below and orders from the cheaper one that has it available.</p><div className="form-grid"><label><span>Medco part number</span><input value={form.medco_part_number} onChange={(event) => set("medco_part_number", event.target.value)} placeholder="MMM-6654" /></label><label><span>National Oak part number</span><input value={form.oak_part_number} onChange={(event) => set("oak_part_number", event.target.value)} placeholder="3M-06654" /></label><label><span>Medco cost</span><div className="money-input"><b>$</b><input aria-label="Medco cost" type="number" min="0" step="0.01" value={form.medco_cost} onChange={(event) => set("medco_cost", event.target.value)} /></div></label><label><span>National Oak cost</span><div className="money-input"><b>$</b><input aria-label="National Oak cost" type="number" min="0" step="0.01" value={form.oak_cost} onChange={(event) => set("oak_cost", event.target.value)} /></div></label><label><span>Medco minimum qty</span><input aria-label="Medco minimum order quantity" type="number" min="1" step="1" value={form.medco_moq} onChange={(event) => set("medco_moq", event.target.value)} /></label><label><span>National Oak minimum qty</span><input aria-label="National Oak minimum order quantity" type="number" min="1" step="1" value={form.oak_moq} onChange={(event) => set("oak_moq", event.target.value)} /></label></div><div className="supplier-availability"><label><input type="checkbox" checked={form.medco_available} onChange={(event) => setForm((current) => ({ ...current, medco_available: event.target.checked }))} /> Medco has it available</label><label><input type="checkbox" checked={form.oak_available} onChange={(event) => setForm((current) => ({ ...current, oak_available: event.target.checked }))} /> National Oak has it available</label></div><p className="field-note">Leave a warehouse cost at $0.00 when you don't have it — the generator falls back to My cost for that warehouse and says so on the PO.</p></fieldset><fieldset><legend>Photos</legend>{product ? <ProductGallery images={productImages(product)} title={product.title} /> : null}<label className="wide-field image-urls-field"><span>Image URLs — one per line, in gallery order</span><textarea aria-label="Image URLs, one per line" value={form.image_urls_text} onChange={(event) => set("image_urls_text", event.target.value)} placeholder={"https://…/photo-1.jpg\nhttps://…/photo-2.jpg"} rows={4} /><small>All of this product&apos;s photos. The first one becomes the thumbnail in lists. Clear all lines to remove the gallery.</small></label><label className="thumbnail-picker"><span className="product-thumb preview-thumb">{thumbnailPreview ? <img src={thumbnailPreview} alt="Product thumbnail preview" /> : (form.vendor || form.title || "PR").slice(0, 2).toUpperCase()}</span><span><strong>{thumbnail ? thumbnail.name : product?.thumbnail_url ? "Replace product image" : "Add product image"}</strong><small>JPEG, PNG, or WebP · up to 8 MB</small></span><input aria-label="Choose product thumbnail" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; if (thumbnailPreview?.startsWith("blob:")) URL.revokeObjectURL(thumbnailPreview); setThumbnail(file); setThumbnailPreview(URL.createObjectURL(file)); }} /></label></fieldset><fieldset><legend>Pricing</legend><div className="pricing-grid"><label><span>List / MSRP</span><div className="money-input"><b>$</b><input aria-label="List price or MSRP" type="number" min="0" step="0.01" value={form.msrp} onChange={(event) => set("msrp", event.target.value)} /></div></label><label><span>Customer price</span><div className="money-input"><b>$</b><input aria-label="Customer price" type="number" min="0" step="0.01" value={form.customer_price} onChange={(event) => updatePrice(event.target.value)} /></div></label><label><span>My cost</span><div className="money-input"><b>$</b><input aria-label="My cost" type="number" min="0" step="0.01" value={form.cost} onChange={(event) => updateCost(event.target.value)} /></div></label><label><span>Markup</span><div className="money-input"><input aria-label="Markup percent" type="number" min="-100" max="10000" step="0.01" value={form.markup} onChange={(event) => updateMarkup(event.target.value)} /><b>%</b></div></label></div><p className="field-note">Changing cost keeps your markup % fixed and recalculates the customer price from it. When you save a new cost, that recalculated price goes to Markup Rules as a proposal — the live price doesn&apos;t change until you approve it there. Changing markup recalculates customer price; typing a customer price directly recalculates markup.</p></fieldset><fieldset><legend>Catalog status</legend><div className="form-grid">{!product ? <label><span>Starting quantity</span><input type="number" min="0" step="1" value={form.quantity} onChange={(event) => set("quantity", event.target.value)} /></label> : null}<label><span>Status</span><select value={form.status} onChange={(event) => set("status", event.target.value as "active" | "draft")}><option value="active">Active</option><option value="draft">Draft</option></select></label></div></fieldset>{error ? <p className="form-error" role="alert">{error}</p> : null}<div className="form-actions"><button className="secondary-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : product ? "Save pricing" : "Add product"}</button></div></form></section></div>;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let value = ""; let quoted = false;
  for (let index = 0; index < text.length; index += 1) { const character = text[index] ?? ""; const next = text[index + 1] ?? ""; if (character === '"' && quoted && next === '"') { value += '"'; index += 1; } else if (character === '"') quoted = !quoted; else if (character === "," && !quoted) { row.push(value); value = ""; } else if ((character === "\n" || character === "\r") && !quoted) { if (character === "\r" && next === "\n") index += 1; row.push(value); if (row.some((cell) => cell.trim())) rows.push(row); row = []; value = ""; } else value += character; }
  row.push(value); if (row.some((cell) => cell.trim())) rows.push(row); return rows;
}
function csvKey(value: string) { return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ""); }

function BulkProductImport({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient(); const [fileName, setFileName] = useState(""); const [items, setItems] = useState<Array<{ title: string; short_description: string; description: string; tags: string[]; image_urls: string[]; vendor: string; part_number: string; sku: string; medco_part_number: string; oak_part_number: string; medco_cost_cents: number; oak_cost_cents: number; medco_moq: number; oak_moq: number; medco_available: boolean; oak_available: boolean; barcode: string | null; msrp_cents: number; price_cents: number; cost_cents: number; markup_bps: number; status: "active" | "draft"; quantity: number }>>([]); const [error, setError] = useState(""); const [result, setResult] = useState("");
  const load = async (file: File) => { setError(""); setResult(""); const rows = parseCsv(await file.text()); const header = rows[0]?.map(csvKey) ?? []; const find = (...names: string[]) => header.findIndex((key) => names.includes(key)); const titleIndex = find("title", "name", "product", "description", "shortdescription"); if (titleIndex < 0) { setError("CSV needs a Title, Name, Product, or Description column."); setItems([]); return; } const column = { title: titleIndex, description: find("shortdescription", "description"), fullDescription: find("bodyhtml", "body", "fulldescription", "longdescription", "description"), tags: find("tags", "tag"), images: find("imageurls", "images", "imageurl", "imagesrc"), vendor: find("vendor", "brand", "manufacturer"), part: find("partnumber", "partno", "mfrpartnumber", "mpn"), sku: find("sku", "variantsku"), medco: find("medcopartnumber", "medconumber", "medco"), oak: find("nationaloakpartnumber", "oakpartnumber", "nationaloak", "oak"), barcode: find("barcode", "upc", "gtin", "variantbarcode", "variantbarcodes"), msrp: find("variantcompareatprice", "compareatprice", "compareat", "msrp", "listprice", "list"), price: find("customerprice", "variantprice", "price", "sellingprice"), cost: find("cost", "mycost", "unitcost"), markup: find("markup", "markuppercent"), quantity: find("quantity", "qty", "onhand", "variantinventoryqty"), status: find("status") }; const cell = (row: string[], index: number) => index >= 0 ? (row[index] ?? "").trim() : ""; const parsed = rows.slice(1).map((row) => { const costValue = Number(cell(row, column.cost)) || 0; const priceValue = Number(cell(row, column.price)) || 0; const markupText = cell(row, column.markup).replace("%", ""); const calculatedMarkup = costValue > 0 ? ((priceValue - costValue) / costValue) * 100 : 0; return { title: cell(row, column.title), short_description: cell(row, column.description) || cell(row, column.title), description: cell(row, column.fullDescription), tags: cell(row, column.tags).split(",").map((tag) => tag.trim()).filter(Boolean), image_urls: cell(row, column.images).split(/[|;]/).map((url) => url.trim()).filter((url) => /^https?:\/\//i.test(url)), vendor: cell(row, column.vendor), part_number: cell(row, column.part), sku: cell(row, column.sku), medco_part_number: cell(row, column.medco), oak_part_number: cell(row, column.oak), medco_cost_cents: 0, oak_cost_cents: 0, medco_moq: 1, oak_moq: 1, medco_available: true, oak_available: true, barcode: cell(row, column.barcode) || null, msrp_cents: Math.max(0, Math.round((Number(cell(row, column.msrp)) || priceValue) * 100)), price_cents: Math.max(0, Math.round(priceValue * 100)), cost_cents: Math.max(0, Math.round(costValue * 100)), markup_bps: Math.round((markupText !== "" && Number.isFinite(Number(markupText)) ? Number(markupText) : calculatedMarkup) * 100), status: cell(row, column.status).toLowerCase() === "draft" ? "draft" as const : "active" as const, quantity: Math.max(0, Number.parseInt(cell(row, column.quantity) || "0", 10) || 0) }; }).filter((item) => item.title); setFileName(file.name); setItems(parsed); if (parsed.length === 0) setError("No product rows were found in that file."); };
  const importRows = useMutation({ mutationFn: () => api.bulkImportProducts({ items }), onSuccess: async (response) => { setResult(`${response.imported} imported${response.skipped ? ` · ${response.skipped} skipped` : ""}`); if (response.errors.length) setError(response.errors.join(" ")); await queryClient.invalidateQueries(); }, onError: () => setError("Could not import the CSV. Check the file and try again.") });
  return <section className="bulk-panel"><div className="bulk-head"><div><p>BULK UPLOAD</p><h2>Import products from CSV</h2></div><button className="icon-button" onClick={onClose} aria-label="Close bulk upload"><CloseIcon /></button></div><p className="bulk-help">Use columns such as title, short description, vendor, part number, SKU, Medco part number, National Oak part number, barcode, MSRP, customer price, cost, markup, quantity, tags, and status. In a Shopify export, Compare At Price becomes List / MSRP and Tags are carried over as-is. Only a title column is required.</p><label className="file-drop"><UploadIcon /><strong>{fileName || "Choose a CSV file"}</strong><span>{items.length ? `${items.length} valid product rows ready` : "CSV up to 2,000 rows"}</span><input aria-label="Choose product CSV" type="file" accept=".csv,text/csv" onChange={(event) => { const file = event.target.files?.[0]; if (file) void load(file); }} /></label>{items.length ? <div className="bulk-preview"><span>Preview</span>{items.slice(0, 3).map((item, index) => <div key={`${item.title}-${index}`}><b>{item.title}</b><small>{item.sku || item.part_number || item.vendor || "No code supplied"} · {money(item.price_cents)}{item.msrp_cents ? ` · List ${money(item.msrp_cents)}` : ""}{item.tags.length ? ` · ${item.tags.join(", ")}` : ""}</small></div>)}</div> : null}{error ? <p className="form-error" role="alert">{error}</p> : null}{result ? <p className="import-result" role="status">{result}</p> : null}<div className="form-actions"><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={!items.length || importRows.isPending} onClick={() => importRows.mutate()}>{importRows.isPending ? "Importing…" : `Import ${items.length || ""} products`}</button></div></section>;
}

function ProductManagementView() {
  const [search, setSearch] = useState("");
  const deferred = useDeferredValue(search);
  const [selected, setSelected] = useState<Product | null>(null);
  const [adding, setAdding] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [mode, setMode] = useState<"pricing" | "crossref">("pricing");
  const [page, setPage] = useState(0);
  const pageSize = 50;
  useEffect(() => setPage(0), [deferred, mode]);
  const products = useQuery({ queryKey: ["product-management", deferred, page], queryFn: () => api.listProducts({ query: deferred, mode: "all", limit: pageSize, offset: page * pageSize }) });
  const total = products.data?.total ?? 0;
  const first = total === 0 ? 0 : page * pageSize + 1;
  const last = Math.min(total, (page + 1) * pageSize);
  return <>
    <section className="plain-command product-command"><div><p>CATALOG & PRICING</p><h1>Product management</h1></div><div className="command-actions"><button className="secondary-button" onClick={() => setUploading((value) => !value)}><UploadIcon /> Upload CSV</button><button className="primary-button" onClick={() => setAdding(true)}><PlusIcon /> Add item</button></div></section>
    {uploading ? <BulkProductImport onClose={() => setUploading(false)} /> : null}
    <nav className="mode-tabs product-tabs" aria-label="Product management views"><button className={mode === "pricing" ? "active" : ""} onClick={() => setMode("pricing")}>Price book</button><button className={mode === "crossref" ? "active" : ""} onClick={() => setMode("crossref")}>Supplier cross-reference</button></nav>
    <div className="customer-search"><SearchField value={search} onChange={setSearch} placeholder="Search product, part number, SKU, or supplier code" label="Search product pricing" /></div>
    <section className="inventory-section"><div className="section-heading"><div><p>{mode === "crossref" ? "WAREHOUSE CODES" : search ? "SEARCH RESULTS" : "PRICE BOOK"}</p><h1>{mode === "crossref" ? "Supplier cross-reference" : search ? `Matches for “${search}”` : "Products and pricing"}</h1></div><span>{first.toLocaleString()}–{last.toLocaleString()} of {total.toLocaleString()}</span></div>
      {products.isPending ? <div className="loading-list"><span /><span /><span /></div> : null}
      {products.data?.products.length === 0 ? <div className="empty-state"><h2>No products found</h2><p>Add an item manually or upload a CSV.</p></div> : mode === "crossref" ? <div className="crossref-list"><div className="crossref-columns"><span>My product</span><span>Medco #</span><span>National Oak #</span><span /></div>{products.data?.products.map((product) => <button key={product.id} className="crossref-row" onClick={() => setSelected(product)}><span className="product-thumb">{product.thumbnail_url ? <img src={product.thumbnail_url} alt="" /> : (product.vendor || product.title).slice(0, 2).toUpperCase()}</span><span className="pricing-product"><strong>{product.short_description || product.title}</strong><small>{product.part_number ? `My part # ${product.part_number}` : product.sku ? `SKU ${product.sku}` : "No internal code"}</small></span><span data-label="Medco #"><b>{product.medco_part_number || "Not carried / not set"}</b></span><span data-label="National Oak #"><b>{product.oak_part_number || "Not carried / not set"}</b></span><ChevronIcon /></button>)}</div> : <div className="pricing-list"><div className="pricing-columns"><span>Product</span><span>Codes</span><span>List / MSRP</span><span>Customer</span><span>My cost</span><span>Markup</span><span /></div>{products.data?.products.map((product) => <button key={product.id} className="pricing-row" onClick={() => setSelected(product)}><span className="product-thumb">{product.thumbnail_url ? <img src={product.thumbnail_url} alt="" /> : (product.vendor || product.title).slice(0, 2).toUpperCase()}</span><span className="pricing-product"><strong>{product.short_description || product.title}</strong><small>{product.vendor || "No vendor"}</small>{(product.tags ?? []).length ? <small className="pricing-tags">{(product.tags ?? []).join(" · ")}</small> : null}</span><span className="pricing-codes"><b>{product.part_number || "No part #"}</b><small>{product.sku ? `SKU ${product.sku}` : product.barcode ? `UPC ${product.barcode}` : "No SKU"}</small></span><span data-label="List / MSRP">{money(product.msrp_cents)}</span><span data-label="Customer">{money(product.price_cents)}</span><span data-label="My cost">{money(product.cost_cents)}</span><span className={product.markup_bps < 0 ? "negative-markup" : "markup-value"} data-label="Markup">{(product.markup_bps / 100).toFixed(2)}%</span><ChevronIcon /></button>)}</div>}
      {total > pageSize ? <div className="pagination"><button disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>Previous</button><span>Page {page + 1} of {Math.ceil(total / pageSize)}</span><button disabled={last >= total} onClick={() => setPage((value) => value + 1)}>Next</button></div> : null}
    </section>
    {adding ? <ProductPricingForm onClose={() => setAdding(false)} /> : null}
    {selected ? <ProductPricingForm product={selected} onClose={() => setSelected(null)} /> : null}
  </>;
}

function CustomerForm({ onDone, initial, onCancel }: { onDone: (customer: Customer) => void; initial?: Customer; onCancel?: () => void }) {
  const blank: CustomerDraft = {
    name: "", business_name: "", phone: "", email: "", tax_id: "",
    delivery_street: "", delivery_city: "", delivery_state: "", delivery_zip: "",
    ap_name: "", ap_phone: "", ap_email: "", card_last4: "", card_expiry: "", cardholder_name: "",
    tax_status: "taxable", tax_rate_override_bps: null, print_balance_due: true, notes: "",
  };
  const [form, setForm] = useState<CustomerDraft>(() => initial ? {
    name: initial.name, business_name: initial.business_name, phone: initial.phone, email: initial.email,
    tax_id: initial.tax_id, delivery_street: initial.delivery_street, delivery_city: initial.delivery_city,
    delivery_state: initial.delivery_state, delivery_zip: initial.delivery_zip, ap_name: initial.ap_name,
    ap_phone: initial.ap_phone, ap_email: initial.ap_email, card_last4: initial.card_last4,
    card_expiry: initial.card_expiry, cardholder_name: initial.cardholder_name, tax_status: initial.tax_status,
    tax_rate_override_bps: initial.tax_rate_override_bps, print_balance_due: initial.print_balance_due, notes: initial.notes,
  } : blank);
  const [error, setError] = useState("");
  const automaticRate = stateTaxRateBps(form.delivery_state);
  const manualRate = form.tax_rate_override_bps;
  const hasManualRate = manualRate !== null;
  const set = <K extends keyof CustomerDraft>(key: K, value: CustomerDraft[K]) => setForm((current) => ({ ...current, [key]: value }));
  const save = useMutation({
    mutationFn: () => initial ? api.updateCustomer({ id: initial.id, ...form }) : api.createCustomer(form),
    onSuccess: (result) => { if (!result.ok || !result.customer) { setError(result.error ?? "Could not save customer."); return; } onDone(result.customer); },
    onError: () => setError("Could not save customer."),
  });
  return <form className="customer-form customer-record-form" onSubmit={(event) => { event.preventDefault(); setError(""); save.mutate(); }}>
    <fieldset><legend>Main contact</legend><div className="form-grid">
      <label><span>Contact name *</span><input required value={form.name} onChange={(event) => set("name", event.target.value)} autoComplete="name" /></label>
      <label><span>Business name</span><input value={form.business_name} onChange={(event) => set("business_name", event.target.value)} autoComplete="organization" /></label>
      <label><span>Phone</span><input value={form.phone} onChange={(event) => set("phone", event.target.value)} inputMode="tel" autoComplete="tel" /></label>
      <label><span>Email</span><input value={form.email} onChange={(event) => set("email", event.target.value)} inputMode="email" autoComplete="email" /></label>
    </div></fieldset>
    <fieldset><legend>Delivery address</legend><div className="form-grid address-grid">
      <label className="street-field"><span>Street</span><input value={form.delivery_street} onChange={(event) => set("delivery_street", event.target.value)} autoComplete="street-address" /></label>
      <label><span>City</span><input value={form.delivery_city} onChange={(event) => set("delivery_city", event.target.value)} autoComplete="address-level2" /></label>
      <label><span>State</span><input value={form.delivery_state} onChange={(event) => set("delivery_state", event.target.value)} autoComplete="address-level1" /></label>
      <label><span>ZIP</span><input value={form.delivery_zip} onChange={(event) => set("delivery_zip", event.target.value)} inputMode="numeric" autoComplete="postal-code" /></label>
    </div></fieldset>
    <fieldset><legend>Accounts payable</legend><div className="form-grid">
      <label><span>AP contact name</span><input value={form.ap_name} onChange={(event) => set("ap_name", event.target.value)} /></label>
      <label><span>AP phone</span><input value={form.ap_phone} onChange={(event) => set("ap_phone", event.target.value)} inputMode="tel" /></label>
      <label><span>AP email</span><input value={form.ap_email} onChange={(event) => set("ap_email", event.target.value)} inputMode="email" /></label>
    </div></fieldset>
    <fieldset><legend>Billing & tax</legend><div className="form-grid">
      <label><span>Tax ID number</span><input value={form.tax_id} onChange={(event) => set("tax_id", event.target.value)} /></label>
      <label><span>Tax status</span><select value={form.tax_status} onChange={(event) => set("tax_status", event.target.value as "taxable" | "exempt")}><option value="taxable">Taxable</option><option value="exempt">Tax exempt</option></select></label>
      <label><span>Rate selection</span><select aria-label="Tax rate selection" disabled={form.tax_status === "exempt"} value={hasManualRate ? "manual" : "automatic"} onChange={(event) => set("tax_rate_override_bps", event.target.value === "manual" ? (automaticRate ?? 0) : null)}><option value="automatic">Automatic from delivery state</option><option value="manual">Manual override</option></select></label>
      {manualRate !== null && form.tax_status === "taxable" ? <label><span>Manual tax rate (%)</span><input aria-label="Manual customer tax rate percent" type="number" min="0" max="30" step="0.01" value={(manualRate / 100).toFixed(2)} onChange={(event) => set("tax_rate_override_bps", Math.round(Math.max(0, Number(event.target.value) || 0) * 100))} /></label> : null}
    </div><p className="field-note">{form.tax_status === "exempt" ? "Exempt customers are charged $0.00 tax." : manualRate !== null ? `Manual override: ${percent(manualRate)}. This wins over the delivery state.` : automaticRate !== null ? `Automatic rate: ${percent(automaticRate)} from the delivery state.` : "Enter RI or Rhode Island for 7.00%, or MA or Massachusetts for 6.25%. Other states have no configured rate yet."}</p></fieldset>
    <fieldset><legend>Receipts &amp; invoices</legend>
      <button type="button" role="switch" aria-checked={form.print_balance_due} aria-label="Print total balance due on receipts and invoices" className="print-balance-toggle" onClick={() => set("print_balance_due", !form.print_balance_due)}>
        <span className="toggle-track" aria-hidden="true"><span className="toggle-thumb" /></span>
        <span className="toggle-copy"><strong>Print total balance due on every receipt / invoice</strong><small>{form.print_balance_due ? "On — each slip also shows this customer's total account balance due (all open invoices), on top of that invoice's own amounts." : "Off — slips show only that invoice's own amounts (items, tax, total, and what is due on that invoice). The total account balance due is not printed. Good for net-30 customers who don't want the running total on every slip."}</small></span>
      </button>
      <p className="field-note">This only changes what prints on the customer's receipts and invoices (screen preview, PDF, and the emailed / texted copy). You still see the full balance here in the app, and monthly statements still show everything due.</p>
    </fieldset>
    <fieldset><legend>Card on file</legend><p className="field-note security-note">For security, only save the last 4 digits, expiry month, and cardholder name. Never enter a full card number.</p><div className="form-grid">
      <label><span>Last 4 digits</span><input aria-label="Card last 4 digits" value={form.card_last4} onChange={(event) => set("card_last4", event.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" maxLength={4} placeholder="1234" /></label>
      <label><span>Expiry</span><input aria-label="Card expiry month" type="month" value={form.card_expiry} onChange={(event) => set("card_expiry", event.target.value)} /></label>
      <label><span>Cardholder name</span><input value={form.cardholder_name} onChange={(event) => set("cardholder_name", event.target.value)} autoComplete="cc-name" /></label>
    </div></fieldset>
    <label className="notes-field"><span>Notes</span><textarea value={form.notes} onChange={(event) => set("notes", event.target.value)} rows={3} /></label>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    <div className="form-actions">{onCancel ? <button type="button" className="secondary-button" onClick={onCancel}>Cancel</button> : null}<button className="primary-button" disabled={save.isPending}>{save.isPending ? "Saving…" : initial ? "Save customer" : "Add customer"}</button></div>
  </form>;
}

type AccountOrder = Account["orders"][number];

function invoiceText(order: AccountOrder, customer: Customer | null): string {
  const data = invoicePdfData(order, customer);
  const lines = data.items.map((item) => `${item.quantity} x ${item.title}${item.returned > 0 ? ` (${item.returned} returned)` : ""} @ ${money(item.unitCents)} — ${money(item.lineCents)}`);
  const returnLines = order.returns.flatMap((ret) => [
    `${when(ret.created_at)} · ${refundMethodLabel(ret.refund_method)} · -${money(ret.total_cents)}`,
    ...ret.items.map((item) => `  ${item.quantity} x ${item.product_title} — ${item.reason}`),
  ]);
  return [
    "RIMA SUPPLY COMPANY",
    "========================================",
    data.invoiceNumber !== null ? `INVOICE #${data.invoiceNumber}` : "INVOICE",
    `Date: ${data.dateLabel}`,
    `Salesperson: ${data.salesperson}`,
    `Status: ${data.statusLabel}`,
    "",
    "BILL TO",
    data.customerDisplay,
    ...(data.contactName ? [`Attn: ${data.contactName}`] : []),
    ...data.addressLines,
    ...(data.phone ? [data.phone] : []),
    ...(data.email ? [data.email] : []),
    "",
    "ITEMS",
    "----------------------------------------",
    ...lines,
    ...(returnLines.length ? ["", "RETURNS", ...returnLines] : []),
    "----------------------------------------",
    `Subtotal: ${money(data.subtotalCents)}`,
    `${data.taxLabel}: ${money(data.taxCents)}`,
    `TOTAL: ${money(data.totalCents)}`,
    `Paid: ${money(data.paidCents)}`,
    data.balanceCents < 0 ? `Account credit on this invoice: ${money(-data.balanceCents)}` : data.balanceCents > 0 ? `BALANCE DUE ON THIS INVOICE: ${money(data.balanceCents)}` : "Paid in full",
    ...(data.showTotalBalance && data.totalBalanceCents !== null ? [data.totalBalanceCents < 0 ? `TOTAL ACCOUNT CREDIT (ALL INVOICES): ${money(-data.totalBalanceCents)}` : data.totalBalanceCents > 0 ? `TOTAL ACCOUNT BALANCE DUE (ALL INVOICES): ${money(data.totalBalanceCents)}` : "TOTAL ACCOUNT BALANCE DUE (ALL INVOICES): $0.00"] : []),
    "",
    "Thank you for your business!",
  ].join("\n");
}

type InvoicePdfData = {
  invoiceNumber: number | null;
  dateLabel: string;
  dateShort: string;
  customerDisplay: string;
  contactName: string;
  addressLines: string[];
  phone: string;
  email: string;
  salesperson: string;
  statusLabel: string;
  statusKind: "paid" | "due" | "partial" | "credit";
  items: Array<{ title: string; quantity: number; returned: number; unitCents: number; lineCents: number }>;
  returns: Array<{ dateLabel: string; methodLabel: string; totalCents: number; items: Array<{ quantity: number; title: string; reason: string; lineCents: number }> }>;
  subtotalCents: number;
  taxLabel: string;
  taxCents: number;
  totalCents: number;
  paidCents: number;
  balanceCents: number;
  showTotalBalance: boolean;
  totalBalanceCents: number | null;
};

function invoicePdfData(order: AccountOrder, customer: Customer | null): InvoicePdfData {
  const customerDisplay = customer ? (customer.business_name || customer.name) : (order.customer_name || "Walk-in customer");
  const contactName = customer && customer.business_name ? customer.name : "";
  const addressLines: string[] = [];
  if (customer) {
    const street = customer.delivery_street.trim();
    const cityLine = [customer.delivery_city.trim(), customer.delivery_state.trim()].filter(Boolean).join(", ");
    const cityZip = [cityLine, customer.delivery_zip.trim()].filter(Boolean).join(" ");
    if (street) addressLines.push(street);
    if (cityZip) addressLines.push(cityZip);
  }
  const statusLabel = order.balance_cents < 0 ? "Account credit" : order.balance_cents === 0 ? "Paid in full" : order.paid_cents > 0 ? "Partially paid — balance due" : "Balance due";
  const statusKind: InvoicePdfData["statusKind"] = order.balance_cents < 0 ? "credit" : order.balance_cents === 0 ? "paid" : order.paid_cents > 0 ? "partial" : "due";
  return {
    invoiceNumber: order.invoice_number,
    dateLabel: when(order.created_at),
    dateShort: shortDate(order.created_at),
    customerDisplay,
    contactName,
    addressLines,
    phone: customer?.phone ?? "",
    email: customer?.email ?? "",
    salesperson: order.salesperson,
    statusLabel,
    statusKind,
    items: order.items.map((item) => ({ title: item.product_title, quantity: item.quantity, returned: item.returned_quantity, unitCents: item.unit_price_cents, lineCents: item.line_total_cents })),
    returns: order.returns.map((ret) => ({ dateLabel: when(ret.created_at), methodLabel: refundMethodLabel(ret.refund_method), totalCents: ret.total_cents, items: ret.items.map((item) => ({ quantity: item.quantity, title: item.product_title, reason: item.reason, lineCents: item.line_total_cents })) })),
    subtotalCents: order.subtotal_cents,
    taxLabel: order.tax_status === "exempt" ? "Tax (exempt)" : `Tax (${percent(order.tax_rate_bps)})`,
    taxCents: order.tax_cents,
    totalCents: order.total_cents,
    paidCents: order.paid_cents,
    balanceCents: order.balance_cents,
    // Per-customer print setting: only when it's on (and there is an account
    // customer) does a slip carry the customer's TOTAL account balance due.
    // When off, the slip shows only this invoice's own amounts.
    showTotalBalance: customer ? customer.print_balance_due : false,
    totalBalanceCents: customer ? customer.balance_cents : null,
  };
}

function refundMethodLabel(method: "cash" | "card" | "account_credit"): string {
  return method === "cash" ? "Cash refund" : method === "card" ? "Card refund" : "On-account credit";
}

function statementText(data: Account, customer: Customer): string {
  const recipient = customer.business_name || customer.name;
  const invoices = data.orders.map((order) => `${order.invoice_number !== null ? `Invoice #${order.invoice_number}` : "Invoice"} · ${when(order.created_at)} · ${money(order.total_cents)} · ${money(order.balance_cents)} due`);
  const payments = data.payments.map((payment) => `${when(payment.created_at)} · ${payment.method} payment · ${money(payment.amount_cents)}`);
  return [
    "RIMA SUPPLY COMPANY",
    "ACCOUNT STATEMENT",
    `Customer: ${recipient}`,
    `Open balance: ${money(customer.balance_cents)}`,
    "",
    "INVOICES",
    ...(invoices.length ? invoices : ["No invoices"]),
    "",
    "PAYMENTS",
    ...(payments.length ? payments : ["No payments"]),
  ].join("\n");
}

function packingSlipText(slip: { customerLabel: string; contactName: string; address: string; phone: string; invoiceNumber: number | null; createdBy: string; dateIso: string; notes: string; lines: Array<{ quantity: number; title: string; partNumber: string }> }): string {
  const lines = slip.lines.map((line, index) => `${index + 1}. [ ] PULLED   QTY ${line.quantity}   ${line.title}${line.partNumber ? `  (Part # ${line.partNumber})` : ""}`);
  return [
    "RIMA SUPPLY COMPANY",
    "========================================",
    "PACKING SLIP",
    slip.invoiceNumber !== null ? `Invoice #${slip.invoiceNumber}` : "Draft — not yet invoiced",
    `Date: ${when(slip.dateIso)}`,
    `Order taken by: ${slip.createdBy}`,
    "",
    "DELIVER TO",
    slip.customerLabel,
    ...(slip.contactName ? [`Attn: ${slip.contactName}`] : []),
    ...(slip.address ? [slip.address] : []),
    ...(slip.phone ? [slip.phone] : []),
    "",
    "ITEMS TO PULL",
    "----------------------------------------",
    ...lines,
    "----------------------------------------",
    `Total items to pull: ${slip.lines.reduce((sum, line) => sum + line.quantity, 0)} across ${slip.lines.length} product${slip.lines.length === 1 ? "" : "s"}`,
    ...(slip.notes ? ["", `Notes: ${slip.notes}`] : []),
    "",
    "Picked by: ____________________   Date: ____________",
  ].join("\n");
}

type PackingSlipData = {
  invoiceNumber: number | null;
  dateLabel: string;
  dateShort: string;
  customerDisplay: string;
  contactName: string;
  addressLines: string[];
  phone: string;
  createdBy: string;
  statusLabel: string;
  notes: string;
  totalItems: number;
  items: Array<{ title: string; partNumber: string; quantity: number; thumbnailUrl: string | null }>;
};

function PackingSlipDocument({ data }: { data: PackingSlipData }) {
  return <article className="invoice-doc packing-slip-doc" aria-label="Packing slip document">
    <header className="invoice-doc-head">
      <img src={rimaLogo} alt="RIMA Supply Company" />
      <div className="invoice-doc-title">
        <span>PACKING SLIP</span>
        <strong>{data.invoiceNumber !== null ? `#${data.invoiceNumber}` : "DRAFT"}</strong>
        <small>{data.dateLabel}</small>
        <small>Taken by {data.createdBy}</small>
      </div>
    </header>
    <div className="invoice-doc-meta">
      <section className="invoice-doc-billto" aria-label="Deliver to">
        <h3>Deliver to</h3>
        <strong>{data.customerDisplay}</strong>
        {data.contactName ? <span>Attn: {data.contactName}</span> : null}
        {data.addressLines.map((line) => <span key={line}>{line}</span>)}
        {data.phone ? <span>{data.phone}</span> : null}
        {data.addressLines.length === 0 && !data.phone ? <span>No delivery address on file</span> : null}
      </section>
      <dl className="invoice-doc-details">
        <div><dt>{data.invoiceNumber !== null ? "Invoice #" : "Slip"}</dt><dd>{data.invoiceNumber !== null ? data.invoiceNumber : "Draft"}</dd></div>
        <div><dt>Date</dt><dd>{data.dateShort}</dd></div>
        <div><dt>Taken by</dt><dd>{data.createdBy}</dd></div>
        <div><dt>Status</dt><dd>{data.statusLabel}</dd></div>
        <div><dt>Items</dt><dd>{data.totalItems} to pull</dd></div>
      </dl>
    </div>
    <table className="invoice-doc-table slip-pick-table">
      <thead><tr><th scope="col" className="slip-pick-col">Picked</th><th scope="col">Product</th><th scope="col" className="num">Qty</th></tr></thead>
      <tbody>
        {data.items.map((item, index) => <tr key={index}>
          <td className="slip-pick-col"><span className="slip-pickbox" aria-hidden="true" /></td>
          <td><div className="slip-item">
            {item.thumbnailUrl ? <img className="slip-thumb" src={item.thumbnailUrl} alt="" loading="lazy" /> : <span className="slip-thumb slip-thumb-fallback" aria-hidden="true">{item.title.slice(0, 2).toUpperCase()}</span>}
            <span className="slip-item-copy"><span>{item.title}</span>{item.partNumber ? <em className="slip-part">Part # {item.partNumber}</em> : null}</span>
          </div></td>
          <td className="num slip-qty">{item.quantity}</td>
        </tr>)}
        {data.items.length === 0 ? <tr><td colSpan={3} className="invoice-doc-empty">No items on this order yet.</td></tr> : null}
      </tbody>
    </table>
    <div className="slip-footer">
      <div className="slip-footer-note">
        <strong>{data.totalItems} item{data.totalItems === 1 ? "" : "s"} to pull · {data.items.length} product{data.items.length === 1 ? "" : "s"}</strong>
        {data.notes ? <span>Notes: {data.notes}</span> : null}
      </div>
      <div className="slip-signoff" aria-hidden="true"><span>Picked by ______________________</span><span>Date ____________</span></div>
    </div>
  </article>;
}

function pdfEscape(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)").replace(/[^\x20-\x7E]/g, "?");
}
function wrapPdfLines(text: string, maxChars = 88): string[] {
  const out: string[] = [];
  for (const raw of text.split("\n")) {
    if (raw.length <= maxChars) { out.push(raw); continue; }
    let rest = raw;
    while (rest.length > maxChars) {
      let cut = rest.lastIndexOf(" ", maxChars);
      if (cut < 20) cut = maxChars;
      out.push(rest.slice(0, cut));
      rest = rest.slice(cut).trimStart();
    }
    out.push(rest);
  }
  return out;
}
function buildPdfBlob(title: string, body: string): Blob {
  const lines = wrapPdfLines(`${title}\n${"=".repeat(Math.min(title.length, 60))}\n\n${body}`);
  const perPage = 46;
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += perPage) pages.push(lines.slice(i, i + perPage));
  if (pages.length === 0) pages.push([""]);
  const objects: string[] = [];
  const pageIds: number[] = [];
  // Object layout: 1 catalog, 2 pages, 3 font, then per page: page obj + content obj
  let nextId = 4;
  const pageObjIds: number[] = [];
  const contentObjIds: number[] = [];
  for (let p = 0; p < pages.length; p += 1) { pageObjIds.push(nextId); contentObjIds.push(nextId + 1); nextId += 2; }
  objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
  objects[2] = `<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`;
  pages.forEach((pageLines, idx) => {
    const pageId = pageObjIds[idx] ?? 4;
    const contentId = contentObjIds[idx] ?? 5;
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
    const streamParts = ["BT", "/F1 10 Tf", "14 TL", "50 742 Td"];
    for (const line of pageLines) streamParts.push(`(${pdfEscape(line)}) Tj`, "T*");
    streamParts.push("ET");
    const stream = streamParts.join("\n");
    objects[contentId] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    pageIds.push(pageId);
  });
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (let id = 1; id < nextId; id += 1) {
    offsets[id] = pdf.length;
    pdf += `${id} 0 obj\n${objects[id] ?? ""}\nendobj\n`;
  }
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${nextId}\n0000000000 65535 f \n`;
  for (let id = 1; id < nextId; id += 1) pdf += `${String(offsets[id] ?? 0).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${nextId} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
}
/* ---------- Professional invoice PDF ---------- */
// Helvetica character widths (AFM, units of 1/1000 em) for codes 32–126.
const HELV_WIDTHS: number[] = [278, 278, 355, 556, 556, 889, 667, 222, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
function pdfSafeText(value: string): string {
  return value.replaceAll("—", "-").replaceAll("–", "-").replaceAll("×", "x").replaceAll("‘", "'").replaceAll("’", "'").replaceAll("“", '"').replaceAll("”", '"').replaceAll("…", "...").replaceAll("•", "-").replace(/[^\x20-\x7E]/g, "");
}
function pdfTextWidth(value: string, size: number, bold: boolean): number {
  let units = 0;
  for (const ch of pdfSafeText(value)) {
    const code = ch.charCodeAt(0);
    units += code >= 32 && code <= 126 ? (HELV_WIDTHS[code - 32] ?? 556) : 556;
  }
  return (units / 1000) * size * (bold ? 1.03 : 1);
}
function wrapPdfText(value: string, maxWidth: number, size: number, bold: boolean): string[] {
  const words = pdfSafeText(value).split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (pdfTextWidth(candidate, size, bold) <= maxWidth || !line) line = candidate;
    else { out.push(line); line = word; }
  }
  if (line) out.push(line);
  return out.length ? out : [""];
}
function pdfMoney(cents: number): string { return money(cents); }

let logoBytesPromise: Promise<Uint8Array | null> | null = null;
function loadLogoBytes(): Promise<Uint8Array | null> {
  if (!logoBytesPromise) {
    logoBytesPromise = fetch(rimaLogo)
      .then((res) => (res.ok ? res.arrayBuffer() : null))
      .then((buf) => (buf ? new Uint8Array(buf) : null))
      .catch(() => null);
  }
  return logoBytesPromise;
}

type PdfColor = [number, number, number];
const PDF_BLACK: PdfColor = [0.04, 0.04, 0.04];
const PDF_DARK: PdfColor = [0.13, 0.13, 0.12];
const PDF_GREY: PdfColor = [0.38, 0.39, 0.37];
const PDF_LIGHT_LINE: PdfColor = [0.85, 0.85, 0.83];
const PDF_WHITE: PdfColor = [1, 1, 1];
const PDF_YELLOW: PdfColor = [0.9, 0.9, 0];
const PDF_YELLOW_DARK: PdfColor = [0.55, 0.55, 0];
const PDF_GREEN: PdfColor = [0.09, 0.44, 0.3];
const PDF_RED: PdfColor = [0.74, 0.21, 0.18];
const PDF_SHADE: PdfColor = [0.965, 0.965, 0.95];
const PDF_BOX: PdfColor = [0.945, 0.945, 0.93];

function colorOp(color: PdfColor, stroke = false): string {
  return `${color[0].toFixed(3)} ${color[1].toFixed(3)} ${color[2].toFixed(3)} ${stroke ? "RG" : "rg"}`;
}

async function buildInvoicePdfBlob(data: InvoicePdfData): Promise<Blob> {
  const logo = await loadLogoBytes();
  const PW = 612; const PH = 792; const M = 42; const R = PW - M; const W = R - M;
  const pages: string[][] = [];
  let ops: string[] = [];
  let y = PH;
  const startPage = (continued: boolean) => {
    ops = [];
    pages.push(ops);
    if (!continued) {
      // Black header band with yellow rule, logo left, invoice id top-right.
      ops.push(colorOp(PDF_BLACK), `0 ${PH - 104} ${PW} 104 re f`);
      ops.push(colorOp(PDF_YELLOW), `0 ${PH - 108} ${PW} 4 re f`);
      if (logo) {
        const logoW = 122; const logoH = (logoW * 766) / 1078;
        ops.push(`q ${logoW.toFixed(2)} 0 0 ${logoH.toFixed(2)} ${M} ${(PH - 10 - logoH).toFixed(2)} cm /Im1 Do Q`);
      } else {
        drawText("RIMA", M, PH - 48, { font: "F2", size: 30, color: PDF_YELLOW });
        drawText("SUPPLY COMPANY", M + 1, PH - 66, { font: "F2", size: 10, color: PDF_WHITE });
      }
      drawText("INVOICE", R, PH - 42, { font: "F2", size: 27, color: PDF_WHITE, align: "right" });
      drawText(data.invoiceNumber !== null ? `Invoice #${data.invoiceNumber}` : "Invoice", R, PH - 64, { font: "F2", size: 12.5, color: PDF_YELLOW, align: "right" });
      drawText(data.dateLabel, R, PH - 81, { font: "F1", size: 9.5, color: [0.82, 0.83, 0.8], align: "right" });
      drawText(`Salesperson: ${data.salesperson}`, R, PH - 95, { font: "F1", size: 8.5, color: [0.82, 0.83, 0.8], align: "right" });
      y = PH - 132;
    } else {
      ops.push(colorOp(PDF_BLACK), `0 ${PH - 40} ${PW} 40 re f`);
      ops.push(colorOp(PDF_YELLOW), `0 ${PH - 43} ${PW} 3 re f`);
      drawText("RIMA SUPPLY COMPANY", M, PH - 26, { font: "F2", size: 11, color: PDF_WHITE });
      drawText(`${data.invoiceNumber !== null ? `Invoice #${data.invoiceNumber}` : "Invoice"} (continued)`, R, PH - 26, { font: "F1", size: 9, color: [0.82, 0.83, 0.8], align: "right" });
      y = PH - 62;
    }
  };
  const drawText = (text: string, x: number, ty: number, opts: { font: "F1" | "F2" | "F3"; size: number; color: PdfColor; align?: "left" | "right" | "center" }) => {
    const safe = pdfSafeText(text);
    if (!safe) return;
    let tx = x;
    const width = pdfTextWidth(safe, opts.size, opts.font === "F2");
    if (opts.align === "right") tx = x - width;
    else if (opts.align === "center") tx = x - width / 2;
    ops.push(`BT /${opts.font} ${opts.size} Tf ${colorOp(opts.color)} 1 0 0 1 ${tx.toFixed(2)} ${ty.toFixed(2)} Tm (${pdfEscape(safe)}) Tj ET`);
  };
  const drawRect = (x: number, ry: number, w: number, h: number, color: PdfColor) => { ops.push(colorOp(color), `${x.toFixed(2)} ${ry.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`); };
  const drawLine = (x1: number, y1: number, x2: number, y2: number, color: PdfColor, width = 0.7) => { ops.push(colorOp(color, true), `${width} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`); };
  const ensureSpace = (needed: number) => { if (y - needed < 58) startPage(true); };

  startPage(false);

  // Bill-to (left) + invoice details box (right).
  const billTop = y;
  drawText("BILL TO", M, billTop, { font: "F2", size: 7.5, color: PDF_YELLOW_DARK });
  let by = billTop - 17;
  for (const line of wrapPdfText(data.customerDisplay, 288, 12.5, true)) { drawText(line, M, by, { font: "F2", size: 12.5, color: PDF_DARK }); by -= 15; }
  const billDetails: string[] = [];
  if (data.contactName) billDetails.push(`Attn: ${data.contactName}`);
  billDetails.push(...data.addressLines);
  if (data.phone) billDetails.push(data.phone);
  if (data.email) billDetails.push(data.email);
  if (billDetails.length === 0) billDetails.push("Walk-in sale");
  for (const line of billDetails) { drawText(line, M, by, { font: "F1", size: 9, color: PDF_GREY }); by -= 12.5; }
  const billBottom = by + 4;

  const boxX = 372; const boxW = R - boxX; const boxRows: Array<[string, string]> = [
    ["Invoice #", data.invoiceNumber !== null ? String(data.invoiceNumber) : "-"],
    ["Date", data.dateShort],
    ["Salesperson", data.salesperson],
    ["Status", data.statusLabel],
  ];
  const boxH = boxRows.length * 15.5 + 13;
  drawRect(boxX, billTop + 6 - boxH, boxW, boxH, PDF_BOX);
  boxRows.forEach(([label, value], i) => {
    const ry = billTop - 8 - i * 15.5;
    drawText(label.toUpperCase(), boxX + 10, ry, { font: "F2", size: 7, color: PDF_GREY });
    const shown = value.length > 30 ? `${value.slice(0, 29)}...` : value;
    drawText(shown, R - 10, ry, { font: "F2", size: 9, color: PDF_DARK, align: "right" });
  });
  y = Math.min(billBottom, billTop + 6 - boxH) - 16;

  // Items table.
  const descX = M + 10; const descW = 262;
  const qtyCenter = 348; const unitR = 464; const amtR = R - 10;
  const drawTableHeader = () => {
    ensureSpace(30);
    drawRect(M, y - 22, W, 22, PDF_DARK);
    drawText("DESCRIPTION", descX, y - 15, { font: "F2", size: 8, color: PDF_WHITE });
    drawText("QTY", qtyCenter, y - 15, { font: "F2", size: 8, color: PDF_WHITE, align: "center" });
    drawText("UNIT PRICE", unitR, y - 15, { font: "F2", size: 8, color: PDF_WHITE, align: "right" });
    drawText("AMOUNT", amtR, y - 15, { font: "F2", size: 8, color: PDF_WHITE, align: "right" });
    y -= 22;
  };
  drawTableHeader();
  data.items.forEach((item, index) => {
    let titleLines = wrapPdfText(item.title, descW, 9, false);
    if (titleLines.length > 3) titleLines = [...titleLines.slice(0, 2), `${titleLines[2] ?? ""}...`];
    const note = item.returned > 0 ? `${item.returned} returned` : "";
    const rowH = titleLines.length * 11.5 + 11 + (note ? 10 : 0);
    if (y - rowH < 58) { startPage(true); drawTableHeader(); }
    const rowTop = y;
    if (index % 2 === 1) drawRect(M, rowTop - rowH, W, rowH, PDF_SHADE);
    titleLines.forEach((line, li) => drawText(line, descX, rowTop - 14 - li * 11.5, { font: "F1", size: 9, color: PDF_DARK }));
    if (note) drawText(note, descX, rowTop - 14 - titleLines.length * 11.5, { font: "F3", size: 7.5, color: PDF_RED });
    const midY = rowTop - rowH / 2 - 3;
    drawText(String(item.quantity), qtyCenter, midY, { font: "F1", size: 9.5, color: PDF_DARK, align: "center" });
    drawText(pdfMoney(item.unitCents), unitR, midY, { font: "F1", size: 9.5, color: PDF_DARK, align: "right" });
    drawText(pdfMoney(item.lineCents), amtR, midY, { font: "F2", size: 9.5, color: PDF_DARK, align: "right" });
    y -= rowH;
    drawLine(M, y, R, y, PDF_LIGHT_LINE, 0.6);
  });
  if (data.items.length === 0) { drawText("No items on this invoice.", descX, y - 14, { font: "F3", size: 9, color: PDF_GREY }); y -= 24; }

  // Returns.
  if (data.returns.length > 0) {
    y -= 14;
    ensureSpace(30);
    drawText("RETURNS & CREDITS", M, y, { font: "F2", size: 8.5, color: PDF_RED });
    y -= 6; drawLine(M, y, R, y, PDF_LIGHT_LINE, 0.7); y -= 13;
    for (const ret of data.returns) {
      ensureSpace(26);
      drawText(`${ret.dateLabel} - ${ret.methodLabel}`, descX, y, { font: "F2", size: 8.5, color: PDF_DARK });
      drawText(`-${pdfMoney(ret.totalCents)}`, amtR, y, { font: "F2", size: 8.5, color: PDF_RED, align: "right" });
      y -= 12;
      for (const item of ret.items) {
        ensureSpace(12);
        drawText(`${item.quantity} x ${item.title} - ${item.reason}`, descX + 8, y, { font: "F1", size: 8, color: PDF_GREY });
        y -= 11;
      }
      y -= 4;
    }
  }

  // Totals.
  const totalsH = data.showTotalBalance && data.totalBalanceCents !== null ? 148 : 118;
  ensureSpace(totalsH + 10);
  y -= 16;
  const totX = 356; const totW = R - totX;
  // Left note area beside totals.
  drawText("Thank you for your business!", M, y - 2, { font: "F2", size: 10, color: PDF_DARK });
  drawText(data.balanceCents > 0 ? "Please remit the balance due shown." : data.balanceCents < 0 ? "The credit shown stays on your account." : "This invoice is paid in full.", M, y - 16, { font: "F1", size: 8.5, color: PDF_GREY });
  drawText(`Sold by ${data.salesperson} - RIMA Supply Company`, M, y - 29, { font: "F1", size: 8.5, color: PDF_GREY });
  const totalRow = (label: string, cents: number, bold = false) => {
    drawText(label, totX, y, { font: bold ? "F2" : "F1", size: 9.5, color: PDF_GREY });
    drawText(pdfMoney(cents), amtR, y, { font: bold ? "F2" : "F1", size: 9.5, color: PDF_DARK, align: "right" });
    y -= 15;
  };
  totalRow("Subtotal", data.subtotalCents);
  totalRow(data.taxLabel, data.taxCents);
  drawLine(totX, y + 4, R, y + 4, PDF_LIGHT_LINE, 0.8);
  y -= 2;
  drawRect(totX - 8, y - 19, totW + 16, 27, PDF_BLACK);
  drawText("TOTAL", totX, y, { font: "F2", size: 11, color: PDF_WHITE });
  drawText(pdfMoney(data.totalCents), amtR, y, { font: "F2", size: 13, color: PDF_YELLOW, align: "right" });
  y -= 30;
  totalRow("Paid", data.paidCents);
  if (data.balanceCents > 0) {
    drawRect(totX - 8, y - 19, totW + 16, 27, PDF_YELLOW);
    drawText("BALANCE DUE", totX, y, { font: "F2", size: 11, color: PDF_BLACK });
    drawText(pdfMoney(data.balanceCents), amtR, y, { font: "F2", size: 13, color: PDF_BLACK, align: "right" });
    y -= 30;
  } else if (data.balanceCents < 0) {
    drawText("CREDIT (THIS INVOICE)", totX, y, { font: "F2", size: 10, color: PDF_GREEN });
    drawText(pdfMoney(-data.balanceCents), amtR, y, { font: "F2", size: 11, color: PDF_GREEN, align: "right" });
    y -= 20;
  } else {
    drawText("BALANCE DUE", totX, y, { font: "F2", size: 10, color: PDF_GREEN });
    drawText("$0.00 - PAID IN FULL", amtR, y, { font: "F2", size: 10, color: PDF_GREEN, align: "right" });
    y -= 20;
  }
  if (data.showTotalBalance && data.totalBalanceCents !== null) {
    drawLine(totX - 8, y + 6, R + 8, y + 6, PDF_LIGHT_LINE, 0.8);
    y -= 4;
    if (data.totalBalanceCents < 0) {
      drawText("TOTAL ACCOUNT CREDIT", totX, y, { font: "F2", size: 9, color: PDF_GREEN });
      drawText(pdfMoney(-data.totalBalanceCents), amtR, y, { font: "F2", size: 10, color: PDF_GREEN, align: "right" });
    } else {
      drawText("TOTAL BALANCE DUE", totX, y, { font: "F2", size: 9, color: PDF_DARK });
      drawText(pdfMoney(data.totalBalanceCents), amtR, y, { font: "F2", size: 10, color: PDF_DARK, align: "right" });
    }
    drawText("(all invoices)", totX, y - 11, { font: "F1", size: 7.5, color: PDF_GREY });
    y -= 26;
  }

  // Footers with page numbers (total now known).
  const totalPages = pages.length;
  pages.forEach((pageOps, i) => {
    const footer: string[] = [];
    const pushText = (text: string, x: number, ty: number, size: number, color: PdfColor, align: "left" | "right" | "center", font: "F1" | "F2" | "F3" = "F1") => {
      const safe = pdfSafeText(text); let tx = x; const width = pdfTextWidth(safe, size, font === "F2");
      if (align === "right") tx = x - width; else if (align === "center") tx = x - width / 2;
      footer.push(`BT /${font} ${size} Tf ${colorOp(color)} 1 0 0 1 ${tx.toFixed(2)} ${ty.toFixed(2)} Tm (${pdfEscape(safe)}) Tj ET`);
    };
    footer.push(colorOp(PDF_LIGHT_LINE, true), `0.7 w ${M} 44 m ${R} 44 l S`);
    pushText("Thank you for your business - RIMA Supply Company", PW / 2, 32, 8, PDF_GREY, "center");
    pushText(`Page ${i + 1} of ${totalPages}`, R, 20, 7.5, PDF_GREY, "right");
    if (data.invoiceNumber !== null) pushText(`Invoice #${data.invoiceNumber} - ${data.dateShort}`, M, 20, 7.5, PDF_GREY, "left");
    pageOps.push(...footer);
  });

  // Assemble PDF bytes (binary-safe for the JPEG logo).
  const encoder = new TextEncoder();
  const hasLogo = logo !== null;
  const imageId = 6;
  const firstPageId = 7;
  const pageIds = pages.map((_, i) => firstPageId + i * 2);
  const objects: Array<{ id: number; chunks: Array<string | Uint8Array> }> = [];
  objects.push({ id: 1, chunks: ["<< /Type /Catalog /Pages 2 0 R >>"] });
  objects.push({ id: 2, chunks: [`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`] });
  objects.push({ id: 3, chunks: ["<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"] });
  objects.push({ id: 4, chunks: ["<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"] });
  objects.push({ id: 5, chunks: ["<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>"] });
  if (hasLogo && logo) {
    objects.push({ id: imageId, chunks: [`<< /Type /XObject /Subtype /Image /Width 1078 /Height 766 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logo.length} >>\nstream\n`, logo, "\nendstream"] });
  }
  pages.forEach((pageOps, i) => {
    const pageId = firstPageId + i * 2; const contentId = pageId + 1;
    const resources = hasLogo ? `<< /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> /XObject << /Im1 ${imageId} 0 R >> >>` : `<< /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >>`;
    objects.push({ id: pageId, chunks: [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources ${resources} /Contents ${contentId} 0 R >>`] });
    const stream = pageOps.join("\n");
    objects.push({ id: contentId, chunks: [`<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}\nendstream`] });
  });
  objects.sort((a, b) => a.id - b.id);
  const chunks: Uint8Array[] = [];
  let length = 0;
  const pushChunk = (chunk: string | Uint8Array) => { const bytes = typeof chunk === "string" ? encoder.encode(chunk) : chunk; chunks.push(bytes); length += bytes.length; };
  pushChunk("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  const offsets = new Map<number, number>();
  for (const obj of objects) {
    offsets.set(obj.id, length);
    pushChunk(`${obj.id} 0 obj\n`);
    for (const chunk of obj.chunks) pushChunk(chunk);
    pushChunk("\nendobj\n");
  }
  const xrefStart = length;
  const maxId = Math.max(...objects.map((o) => o.id));
  let xref = `xref\n0 ${maxId + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= maxId; id += 1) xref += `${String(offsets.get(id) ?? 0).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  pushChunk(xref);
  const all = new Uint8Array(length);
  let pos = 0;
  for (const chunk of chunks) { all.set(chunk, pos); pos += chunk.length; }
  return new Blob([all.buffer as ArrayBuffer], { type: "application/pdf" });
}

async function downloadInvoicePdf(filename: string, order: AccountOrder, customer: Customer | null) {
  const blob = await buildInvoicePdfBlob(invoicePdfData(order, customer));
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = pdfFilename(filename);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 8000);
}

/* ---------- Packing slip PDF (matches the invoice's professional look) ---------- */
type ThumbJpeg = { bytes: Uint8Array; w: number; h: number };
const thumbJpegCache = new Map<string, Promise<ThumbJpeg | null>>();
function loadThumbJpeg(url: string): Promise<ThumbJpeg | null> {
  const cached = thumbJpegCache.get(url);
  if (cached) return cached;
  const promise = (async (): Promise<ThumbJpeg | null> => {
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.crossOrigin = "anonymous";
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("thumb load failed"));
        el.src = url;
      });
      if (!img.naturalWidth || !img.naturalHeight) return null;
      const scale = Math.min(1, 220 / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const cx = canvas.getContext("2d");
      if (!cx) return null;
      cx.fillStyle = "#ffffff";
      cx.fillRect(0, 0, w, h);
      cx.drawImage(img, 0, 0, w, h);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
      if (!blob) return null;
      return { bytes: new Uint8Array(await blob.arrayBuffer()), w, h };
    } catch {
      return null;
    }
  })();
  thumbJpegCache.set(url, promise);
  return promise;
}

async function buildPackingSlipPdfBlob(data: PackingSlipData): Promise<Blob> {
  const logo = await loadLogoBytes();
  const thumbUrls = [...new Set(data.items.map((item) => item.thumbnailUrl).filter((url): url is string => !!url))];
  const thumbByUrl = new Map<string, ThumbJpeg | null>();
  await Promise.all(thumbUrls.map(async (url) => { thumbByUrl.set(url, await loadThumbJpeg(url)); }));
  const PW = 612; const PH = 792; const M = 42; const R = PW - M; const W = R - M;
  const pages: string[][] = [];
  let ops: string[] = [];
  let y = PH;
  // Image XObject names: logo is /Logo; product thumbs are /T0, /T1, ... in thumbUrls order.
  const thumbNameByUrl = new Map<string, string>();
  thumbUrls.forEach((url, i) => { if (thumbByUrl.get(url)) thumbNameByUrl.set(url, `T${i}`); });
  const drawText = (text: string, x: number, ty: number, opts: { font: "F1" | "F2" | "F3"; size: number; color: PdfColor; align?: "left" | "right" | "center" }) => {
    const safe = pdfSafeText(text);
    if (!safe) return;
    let tx = x;
    const width = pdfTextWidth(safe, opts.size, opts.font === "F2");
    if (opts.align === "right") tx = x - width;
    else if (opts.align === "center") tx = x - width / 2;
    ops.push(`BT /${opts.font} ${opts.size} Tf ${colorOp(opts.color)} 1 0 0 1 ${tx.toFixed(2)} ${ty.toFixed(2)} Tm (${pdfEscape(safe)}) Tj ET`);
  };
  const drawRect = (x: number, ry: number, w: number, h: number, color: PdfColor) => { ops.push(colorOp(color), `${x.toFixed(2)} ${ry.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`); };
  const drawLine = (x1: number, y1: number, x2: number, y2: number, color: PdfColor, width = 0.7) => { ops.push(colorOp(color, true), `${width} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`); };
  const startPage = (continued: boolean) => {
    ops = [];
    pages.push(ops);
    if (!continued) {
      ops.push(colorOp(PDF_BLACK), `0 ${PH - 104} ${PW} 104 re f`);
      ops.push(colorOp(PDF_YELLOW), `0 ${PH - 108} ${PW} 4 re f`);
      if (logo) {
        const logoW = 122; const logoH = (logoW * 766) / 1078;
        ops.push(`q ${logoW.toFixed(2)} 0 0 ${logoH.toFixed(2)} ${M} ${(PH - 10 - logoH).toFixed(2)} cm /Logo Do Q`);
      } else {
        drawText("RIMA", M, PH - 48, { font: "F2", size: 30, color: PDF_YELLOW });
        drawText("SUPPLY COMPANY", M + 1, PH - 66, { font: "F2", size: 10, color: PDF_WHITE });
      }
      drawText("PACKING SLIP", R, PH - 42, { font: "F2", size: 25, color: PDF_WHITE, align: "right" });
      drawText(data.invoiceNumber !== null ? `Invoice #${data.invoiceNumber}` : "Draft - not yet invoiced", R, PH - 64, { font: "F2", size: 12.5, color: PDF_YELLOW, align: "right" });
      drawText(data.dateLabel, R, PH - 81, { font: "F1", size: 9.5, color: [0.82, 0.83, 0.8], align: "right" });
      drawText(`Order taken by: ${data.createdBy}`, R, PH - 95, { font: "F1", size: 8.5, color: [0.82, 0.83, 0.8], align: "right" });
      y = PH - 132;
    } else {
      ops.push(colorOp(PDF_BLACK), `0 ${PH - 40} ${PW} 40 re f`);
      ops.push(colorOp(PDF_YELLOW), `0 ${PH - 43} ${PW} 3 re f`);
      drawText("RIMA SUPPLY COMPANY", M, PH - 26, { font: "F2", size: 11, color: PDF_WHITE });
      drawText(`Packing slip ${data.invoiceNumber !== null ? `#${data.invoiceNumber}` : "(draft)"} (continued)`, R, PH - 26, { font: "F1", size: 9, color: [0.82, 0.83, 0.8], align: "right" });
      y = PH - 62;
    }
  };
  const ensureSpace = (needed: number) => { if (y - needed < 58) startPage(true); };

  startPage(false);

  // Deliver-to (left) + slip details box (right).
  const billTop = y;
  drawText("DELIVER TO", M, billTop, { font: "F2", size: 7.5, color: PDF_YELLOW_DARK });
  let by = billTop - 17;
  for (const line of wrapPdfText(data.customerDisplay, 288, 12.5, true)) { drawText(line, M, by, { font: "F2", size: 12.5, color: PDF_DARK }); by -= 15; }
  const deliverDetails: string[] = [];
  if (data.contactName) deliverDetails.push(`Attn: ${data.contactName}`);
  deliverDetails.push(...data.addressLines);
  if (data.phone) deliverDetails.push(data.phone);
  if (deliverDetails.length === 0) deliverDetails.push("No delivery address on file");
  for (const line of deliverDetails) { drawText(line, M, by, { font: "F1", size: 9, color: PDF_GREY }); by -= 12.5; }
  const billBottom = by + 4;

  const boxX = 372; const boxW = R - boxX;
  const boxRows: Array<[string, string]> = [
    [data.invoiceNumber !== null ? "Invoice #" : "Slip", data.invoiceNumber !== null ? String(data.invoiceNumber) : "Draft"],
    ["Date", data.dateShort],
    ["Taken by", data.createdBy],
    ["Status", data.statusLabel],
    ["Items", `${data.totalItems} to pull`],
  ];
  const boxH = boxRows.length * 15.5 + 13;
  drawRect(boxX, billTop + 6 - boxH, boxW, boxH, PDF_BOX);
  boxRows.forEach(([label, value], i) => {
    const ry = billTop - 8 - i * 15.5;
    drawText(label.toUpperCase(), boxX + 10, ry, { font: "F2", size: 7, color: PDF_GREY });
    const shown = value.length > 30 ? `${value.slice(0, 29)}...` : value;
    drawText(shown, R - 10, ry, { font: "F2", size: 9, color: PDF_DARK, align: "right" });
  });
  y = Math.min(billBottom, billTop + 6 - boxH) - 16;

  // Pick list table.
  const textX = M + 84; const qtyCenter = R - 34;
  const drawTableHeader = () => {
    ensureSpace(30);
    drawRect(M, y - 22, W, 22, PDF_DARK);
    drawText("PICKED", M + 10, y - 15, { font: "F2", size: 8, color: PDF_WHITE });
    drawText("PRODUCT", textX, y - 15, { font: "F2", size: 8, color: PDF_WHITE });
    drawText("QTY", qtyCenter, y - 15, { font: "F2", size: 8, color: PDF_WHITE, align: "center" });
    y -= 22;
  };
  drawTableHeader();
  const rowH = 50;
  data.items.forEach((item, index) => {
    if (y - rowH < 58) { startPage(true); drawTableHeader(); }
    const rowTop = y;
    if (index % 2 === 1) drawRect(M, rowTop - rowH, W, rowH, PDF_SHADE);
    // Pick checkbox.
    ops.push(colorOp(PDF_GREY, true), `1.1 w ${(M + 14).toFixed(2)} ${(rowTop - 32).toFixed(2)} 15 15 re S`);
    // Thumbnail (or initials placeholder).
    const thumbBoxX = M + 40; const thumbBoxY = rowTop - 43; const thumbBox = 36;
    const thumb = item.thumbnailUrl ? thumbByUrl.get(item.thumbnailUrl) : null;
    const thumbName = item.thumbnailUrl ? thumbNameByUrl.get(item.thumbnailUrl) : undefined;
    if (thumb && thumbName) {
      const scale = Math.min(thumbBox / thumb.w, thumbBox / thumb.h);
      const dw = thumb.w * scale; const dh = thumb.h * scale;
      const dx = thumbBoxX + (thumbBox - dw) / 2; const dy = thumbBoxY + (thumbBox - dh) / 2;
      ops.push(`q ${dw.toFixed(2)} 0 0 ${dh.toFixed(2)} ${dx.toFixed(2)} ${dy.toFixed(2)} cm /${thumbName} Do Q`);
    } else {
      drawRect(thumbBoxX, thumbBoxY, thumbBox, thumbBox, PDF_BOX);
      const initials = pdfSafeText(item.title).replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word.charAt(0)).join("").toUpperCase() || "—";
      drawText(initials, thumbBoxX + thumbBox / 2, thumbBoxY + 14, { font: "F2", size: 11, color: PDF_GREY, align: "center" });
    }
    // Name + part number.
    let titleLines = wrapPdfText(item.title, qtyCenter - 44 - textX, 9.5, false);
    if (titleLines.length > 2) titleLines = [titleLines[0] ?? "", `${titleLines[1] ?? ""}...`];
    titleLines.forEach((line, li) => drawText(line, textX, rowTop - 19 - li * 11.5, { font: "F1", size: 9.5, color: PDF_DARK }));
    if (item.partNumber) drawText(`Part # ${item.partNumber}`, textX, rowTop - 19 - titleLines.length * 11.5, { font: "F1", size: 7.5, color: PDF_GREY });
    // Quantity.
    drawText(String(item.quantity), qtyCenter, rowTop - 29, { font: "F2", size: 16, color: PDF_DARK, align: "center" });
    y -= rowH;
    drawLine(M, y, R, y, PDF_LIGHT_LINE, 0.6);
  });
  if (data.items.length === 0) { drawText("No items on this order yet.", textX, y - 16, { font: "F3", size: 9, color: PDF_GREY }); y -= 26; }

  // Footer: totals, notes, sign-off.
  const noteLines = data.notes ? wrapPdfText(`Notes: ${data.notes}`, W - 4, 9, false).slice(0, 3) : [];
  ensureSpace(54 + noteLines.length * 12);
  y -= 16;
  drawText(`${data.totalItems} item${data.totalItems === 1 ? "" : "s"} to pull - ${data.items.length} product${data.items.length === 1 ? "" : "s"}`, M, y, { font: "F2", size: 10.5, color: PDF_DARK });
  y -= 15;
  for (const line of noteLines) { drawText(line, M, y, { font: "F1", size: 9, color: PDF_GREY }); y -= 12; }
  y -= 8;
  drawText("Picked by ______________________", M, y, { font: "F1", size: 9.5, color: PDF_DARK });
  drawText("Date ____________", M + 240, y, { font: "F1", size: 9.5, color: PDF_DARK });

  // Page footers.
  const totalPages = pages.length;
  pages.forEach((pageOps, i) => {
    const footer: string[] = [];
    const pushText = (text: string, x: number, ty: number, size: number, color: PdfColor, align: "left" | "right" | "center", font: "F1" | "F2" | "F3" = "F1") => {
      const safe = pdfSafeText(text); let tx = x; const width = pdfTextWidth(safe, size, font === "F2");
      if (align === "right") tx = x - width; else if (align === "center") tx = x - width / 2;
      footer.push(`BT /${font} ${size} Tf ${colorOp(color)} 1 0 0 1 ${tx.toFixed(2)} ${ty.toFixed(2)} Tm (${pdfEscape(safe)}) Tj ET`);
    };
    footer.push(colorOp(PDF_LIGHT_LINE, true), `0.7 w ${M} 44 m ${R} 44 l S`);
    pushText("RIMA Supply Company - Packing Slip", PW / 2, 32, 8, PDF_GREY, "center");
    pushText(`Page ${i + 1} of ${totalPages}`, R, 20, 7.5, PDF_GREY, "right");
    pushText(data.invoiceNumber !== null ? `Invoice #${data.invoiceNumber} - ${data.dateShort}` : `Draft slip - ${data.dateShort}`, M, 20, 7.5, PDF_GREY, "left");
    pageOps.push(...footer);
  });

  // Assemble PDF bytes (binary-safe for JPEG images).
  const encoder = new TextEncoder();
  type ImageEntry = { name: string; thumb: ThumbJpeg };
  const images: ImageEntry[] = [];
  if (logo) images.push({ name: "Logo", thumb: { bytes: logo, w: 1078, h: 766 } });
  for (const url of thumbUrls) {
    const thumb = thumbByUrl.get(url);
    const name = thumbNameByUrl.get(url);
    if (thumb && name) images.push({ name, thumb });
  }
  const firstImageId = 6;
  const imageIdByName = new Map(images.map((entry, i) => [entry.name, firstImageId + i]));
  const firstPageId = firstImageId + images.length;
  const pageIds = pages.map((_, i) => firstPageId + i * 2);
  const objects: Array<{ id: number; chunks: Array<string | Uint8Array> }> = [];
  objects.push({ id: 1, chunks: ["<< /Type /Catalog /Pages 2 0 R >>"] });
  objects.push({ id: 2, chunks: [`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`] });
  objects.push({ id: 3, chunks: ["<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"] });
  objects.push({ id: 4, chunks: ["<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"] });
  objects.push({ id: 5, chunks: ["<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>"] });
  for (const entry of images) {
    const id = imageIdByName.get(entry.name) ?? firstImageId;
    objects.push({ id, chunks: [`<< /Type /XObject /Subtype /Image /Width ${entry.thumb.w} /Height ${entry.thumb.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${entry.thumb.bytes.length} >>\nstream\n`, entry.thumb.bytes, "\nendstream"] });
  }
  pages.forEach((pageOps, i) => {
    const pageId = firstPageId + i * 2; const contentId = pageId + 1;
    const xobjects = images.map((entry) => `/${entry.name} ${imageIdByName.get(entry.name) ?? firstImageId} 0 R`).join(" ");
    const resources = `<< /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> /XObject << ${xobjects} >> >>`;
    objects.push({ id: pageId, chunks: [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources ${resources} /Contents ${contentId} 0 R >>`] });
    const stream = pageOps.join("\n");
    objects.push({ id: contentId, chunks: [`<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}\nendstream`] });
  });
  objects.sort((a, b) => a.id - b.id);
  const chunks: Uint8Array[] = [];
  let length = 0;
  const pushChunk = (chunk: string | Uint8Array) => { const bytes = typeof chunk === "string" ? encoder.encode(chunk) : chunk; chunks.push(bytes); length += bytes.length; };
  pushChunk("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  const offsets = new Map<number, number>();
  for (const obj of objects) {
    offsets.set(obj.id, length);
    pushChunk(`${obj.id} 0 obj\n`);
    for (const chunk of obj.chunks) pushChunk(chunk);
    pushChunk("\nendobj\n");
  }
  const xrefStart = length;
  const maxId = Math.max(...objects.map((o) => o.id));
  let xref = `xref\n0 ${maxId + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= maxId; id += 1) xref += `${String(offsets.get(id) ?? 0).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  pushChunk(xref);
  const all = new Uint8Array(length);
  let pos = 0;
  for (const chunk of chunks) { all.set(chunk, pos); pos += chunk.length; }
  return new Blob([all.buffer as ArrayBuffer], { type: "application/pdf" });
}

async function downloadPackingSlipPdf(filename: string, data: PackingSlipData) {
  const blob = await buildPackingSlipPdfBlob(data);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = pdfFilename(filename);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 8000);
}

/* ---------- Branded statement document (same design language as the invoice) ---------- */
type StatementPdfData = {
  periodLabel: string;
  dateLabel: string;
  dateShort: string;
  customerDisplay: string;
  contactName: string;
  addressLines: string[];
  phone: string;
  email: string;
  invoices: Array<{ invoiceNumber: number | null; dateLabel: string; statusLabel: string; totalCents: number; paidCents: number; balanceCents: number }>;
  totalDueCents: number;
  totalInvoicedCents: number;
  totalPaidCents: number;
};

function customerAddressLines(customer: Customer): string[] {
  const lines: string[] = [];
  const street = customer.delivery_street.trim();
  const cityLine = [customer.delivery_city.trim(), customer.delivery_state.trim()].filter(Boolean).join(", ");
  const cityZip = [cityLine, customer.delivery_zip.trim()].filter(Boolean).join(" ");
  if (street) lines.push(street);
  if (cityZip) lines.push(cityZip);
  return lines;
}

function statementDataForMonthly(data: MonthlyStatement): StatementPdfData | null {
  const customer = data.customer;
  if (!customer) return null;
  return {
    periodLabel: data.period_label,
    dateLabel: when(new Date().toISOString()),
    dateShort: shortDate(new Date().toISOString()),
    customerDisplay: customer.business_name || customer.name,
    contactName: customer.business_name ? customer.name : "",
    addressLines: customerAddressLines(customer),
    phone: customer.phone,
    email: customer.email,
    invoices: data.invoices.map((inv) => ({ invoiceNumber: inv.invoice_number, dateLabel: shortDate(inv.created_at), statusLabel: inv.balance_cents > 0 && inv.paid_cents > 0 ? "Partially paid" : inv.balance_cents > 0 ? "Unpaid" : "Paid", totalCents: inv.total_cents, paidCents: inv.paid_cents, balanceCents: inv.balance_cents })),
    totalDueCents: data.total_due_cents,
    totalInvoicedCents: data.total_invoiced_cents,
    totalPaidCents: data.invoices.reduce((sum, inv) => sum + inv.paid_cents, 0),
  };
}

function statementDataForAccount(data: Account, customer: Customer): StatementPdfData {
  const dueOrders = data.orders.filter((order) => order.balance_cents !== 0);
  return {
    periodLabel: "Account statement",
    dateLabel: when(new Date().toISOString()),
    dateShort: shortDate(new Date().toISOString()),
    customerDisplay: customer.business_name || customer.name,
    contactName: customer.business_name ? customer.name : "",
    addressLines: customerAddressLines(customer),
    phone: customer.phone,
    email: customer.email,
    invoices: dueOrders.map((inv) => ({ invoiceNumber: inv.invoice_number, dateLabel: shortDate(inv.created_at), statusLabel: inv.balance_cents > 0 && inv.paid_cents > 0 ? "Partially paid" : inv.balance_cents > 0 ? "Unpaid" : "Credit", totalCents: inv.total_cents, paidCents: inv.paid_cents, balanceCents: inv.balance_cents })),
    totalDueCents: customer.balance_cents,
    totalInvoicedCents: data.orders.reduce((sum, order) => sum + order.total_cents, 0),
    totalPaidCents: data.orders.reduce((sum, order) => sum + order.paid_cents, 0),
  };
}

function StatementDocument({ data }: { data: StatementPdfData }) {
  return <article className="invoice-doc statement-doc" aria-label={`Statement for ${data.customerDisplay}`}>
    <header className="invoice-doc-head">
      <img src={rimaLogo} alt="RIMA Supply Company" />
      <div className="invoice-doc-title">
        <span>STATEMENT</span>
        <strong>{data.periodLabel}</strong>
        <small>{data.dateLabel}</small>
      </div>
    </header>
    <div className="invoice-doc-meta">
      <section className="invoice-doc-billto" aria-label="Prepared for">
        <h3>Prepared for</h3>
        <strong>{data.customerDisplay}</strong>
        {data.contactName ? <span>Attn: {data.contactName}</span> : null}
        {data.addressLines.map((line) => <span key={line}>{line}</span>)}
        {data.phone ? <span>{data.phone}</span> : null}
        {data.email ? <span>{data.email}</span> : null}
      </section>
      <dl className="invoice-doc-details">
        <div><dt>Period</dt><dd>{data.periodLabel}</dd></div>
        <div><dt>Issued</dt><dd>{data.dateShort}</dd></div>
        <div><dt>Open invoices</dt><dd>{data.invoices.length}</dd></div>
        <div><dt>Total due</dt><dd>{data.totalDueCents < 0 ? `${money(-data.totalDueCents)} credit` : money(data.totalDueCents)}</dd></div>
      </dl>
    </div>
    <table className="invoice-doc-table stmt-table">
      <thead><tr><th scope="col">Invoice</th><th scope="col">Date</th><th scope="col">Status</th><th scope="col" className="num">Total</th><th scope="col" className="num">Paid</th><th scope="col" className="num">Due</th></tr></thead>
      <tbody>
        {data.invoices.map((inv, index) => <tr key={index}>
          <td className="amount">{inv.invoiceNumber !== null ? `#${inv.invoiceNumber}` : "Invoice"}</td>
          <td>{inv.dateLabel}</td>
          <td>{inv.statusLabel}</td>
          <td className="num">{money(inv.totalCents)}</td>
          <td className="num">{money(inv.paidCents)}</td>
          <td className="num amount">{inv.balanceCents < 0 ? `-${money(-inv.balanceCents)}` : money(inv.balanceCents)}</td>
        </tr>)}
        {data.invoices.length === 0 ? <tr><td colSpan={6} className="invoice-doc-empty">No open invoices — this account is clear for this statement.</td></tr> : null}
      </tbody>
    </table>
    <div className="invoice-doc-totals">
      <div className="invoice-doc-note">
        <strong>Thank you for your business!</strong>
        <span>{data.totalDueCents > 0 ? "Please remit the total due shown. Questions? Call the store and we'll sort it out." : data.totalDueCents < 0 ? "Your account carries a credit — it will apply to your next invoice." : "This account is paid in full. Thank you!"}</span>
      </div>
      <dl>
        <div><dt>Total invoiced</dt><dd>{money(data.totalInvoicedCents)}</dd></div>
        <div><dt>Total paid</dt><dd>{money(data.totalPaidCents)}</dd></div>
        {data.totalDueCents > 0 ? <div className="invoice-doc-due"><dt>Total due</dt><dd>{money(data.totalDueCents)}</dd></div>
          : data.totalDueCents < 0 ? <div className="invoice-doc-due credit"><dt>Account credit</dt><dd>{money(-data.totalDueCents)}</dd></div>
          : <div className="invoice-doc-due credit"><dt>Total due</dt><dd>$0.00 · Paid in full</dd></div>}
      </dl>
    </div>
  </article>;
}

async function buildStatementPdfBlob(data: StatementPdfData): Promise<Blob> {
  const logo = await loadLogoBytes();
  const PW = 612; const PH = 792; const M = 42; const R = PW - M; const W = R - M;
  const pages: string[][] = [];
  let ops: string[] = [];
  let y = PH;
  const drawText = (text: string, x: number, ty: number, opts: { font: "F1" | "F2" | "F3"; size: number; color: PdfColor; align?: "left" | "right" | "center" }) => {
    const safe = pdfSafeText(text);
    if (!safe) return;
    let tx = x;
    const width = pdfTextWidth(safe, opts.size, opts.font === "F2");
    if (opts.align === "right") tx = x - width;
    else if (opts.align === "center") tx = x - width / 2;
    ops.push(`BT /${opts.font} ${opts.size} Tf ${colorOp(opts.color)} 1 0 0 1 ${tx.toFixed(2)} ${ty.toFixed(2)} Tm (${pdfEscape(safe)}) Tj ET`);
  };
  const drawRect = (x: number, ry: number, w: number, h: number, color: PdfColor) => { ops.push(colorOp(color), `${x.toFixed(2)} ${ry.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`); };
  const drawLine = (x1: number, y1: number, x2: number, y2: number, color: PdfColor, width = 0.7) => { ops.push(colorOp(color, true), `${width} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`); };
  const startPage = (continued: boolean) => {
    ops = [];
    pages.push(ops);
    if (!continued) {
      ops.push(colorOp(PDF_BLACK), `0 ${PH - 104} ${PW} 104 re f`);
      ops.push(colorOp(PDF_YELLOW), `0 ${PH - 108} ${PW} 4 re f`);
      if (logo) {
        const logoW = 122; const logoH = (logoW * 766) / 1078;
        ops.push(`q ${logoW.toFixed(2)} 0 0 ${logoH.toFixed(2)} ${M} ${(PH - 10 - logoH).toFixed(2)} cm /Im1 Do Q`);
      } else {
        drawText("RIMA", M, PH - 48, { font: "F2", size: 30, color: PDF_YELLOW });
        drawText("SUPPLY COMPANY", M + 1, PH - 66, { font: "F2", size: 10, color: PDF_WHITE });
      }
      drawText("STATEMENT", R, PH - 42, { font: "F2", size: 27, color: PDF_WHITE, align: "right" });
      drawText(data.periodLabel, R, PH - 64, { font: "F2", size: 12.5, color: PDF_YELLOW, align: "right" });
      drawText(data.dateLabel, R, PH - 81, { font: "F1", size: 9.5, color: [0.82, 0.83, 0.8], align: "right" });
      y = PH - 132;
    } else {
      ops.push(colorOp(PDF_BLACK), `0 ${PH - 40} ${PW} 40 re f`);
      ops.push(colorOp(PDF_YELLOW), `0 ${PH - 43} ${PW} 3 re f`);
      drawText("RIMA SUPPLY COMPANY", M, PH - 26, { font: "F2", size: 11, color: PDF_WHITE });
      drawText(`Statement - ${data.periodLabel} (continued)`, R, PH - 26, { font: "F1", size: 9, color: [0.82, 0.83, 0.8], align: "right" });
      y = PH - 62;
    }
  };
  const ensureSpace = (needed: number) => { if (y - needed < 58) startPage(true); };
  startPage(false);

  const billTop = y;
  drawText("PREPARED FOR", M, billTop, { font: "F2", size: 7.5, color: PDF_YELLOW_DARK });
  let by = billTop - 17;
  for (const line of wrapPdfText(data.customerDisplay, 288, 12.5, true)) { drawText(line, M, by, { font: "F2", size: 12.5, color: PDF_DARK }); by -= 15; }
  const custDetails: string[] = [];
  if (data.contactName) custDetails.push(`Attn: ${data.contactName}`);
  custDetails.push(...data.addressLines);
  if (data.phone) custDetails.push(data.phone);
  if (data.email) custDetails.push(data.email);
  if (custDetails.length === 0) custDetails.push("Account customer");
  for (const line of custDetails) { drawText(line, M, by, { font: "F1", size: 9, color: PDF_GREY }); by -= 12.5; }
  const billBottom = by + 4;
  const boxX = 372; const boxW = R - boxX;
  const boxRows: Array<[string, string]> = [
    ["Period", data.periodLabel],
    ["Issued", data.dateShort],
    ["Open invoices", String(data.invoices.length)],
    ["Total due", data.totalDueCents < 0 ? `${pdfMoney(-data.totalDueCents)} credit` : pdfMoney(data.totalDueCents)],
  ];
  const boxH = boxRows.length * 15.5 + 13;
  drawRect(boxX, billTop + 6 - boxH, boxW, boxH, PDF_BOX);
  boxRows.forEach(([label, value], i) => {
    const ry = billTop - 8 - i * 15.5;
    drawText(label.toUpperCase(), boxX + 10, ry, { font: "F2", size: 7, color: PDF_GREY });
    const shown = value.length > 30 ? `${value.slice(0, 29)}...` : value;
    drawText(shown, R - 10, ry, { font: "F2", size: 9, color: PDF_DARK, align: "right" });
  });
  y = Math.min(billBottom, billTop + 6 - boxH) - 16;

  const invX = M + 10; const dateX = M + 92; const statusX = M + 196; const totalR = M + 330; const paidR = M + 424; const dueR = R - 10;
  const drawTableHeader = () => {
    ensureSpace(30);
    drawRect(M, y - 22, W, 22, PDF_DARK);
    drawText("INVOICE", invX, y - 15, { font: "F2", size: 8, color: PDF_WHITE });
    drawText("DATE", dateX, y - 15, { font: "F2", size: 8, color: PDF_WHITE });
    drawText("STATUS", statusX, y - 15, { font: "F2", size: 8, color: PDF_WHITE });
    drawText("TOTAL", totalR, y - 15, { font: "F2", size: 8, color: PDF_WHITE, align: "right" });
    drawText("PAID", paidR, y - 15, { font: "F2", size: 8, color: PDF_WHITE, align: "right" });
    drawText("DUE", dueR, y - 15, { font: "F2", size: 8, color: PDF_WHITE, align: "right" });
    y -= 22;
  };
  drawTableHeader();
  data.invoices.forEach((inv, index) => {
    const rowH = 21;
    if (y - rowH < 58) { startPage(true); drawTableHeader(); }
    const rowTop = y;
    if (index % 2 === 1) drawRect(M, rowTop - rowH, W, rowH, PDF_SHADE);
    const midY = rowTop - 14;
    drawText(inv.invoiceNumber !== null ? `#${inv.invoiceNumber}` : "Invoice", invX, midY, { font: "F2", size: 9.5, color: PDF_DARK });
    drawText(inv.dateLabel, dateX, midY, { font: "F1", size: 9, color: PDF_DARK });
    drawText(inv.statusLabel, statusX, midY, { font: "F1", size: 9, color: PDF_GREY });
    drawText(pdfMoney(inv.totalCents), totalR, midY, { font: "F1", size: 9.5, color: PDF_DARK, align: "right" });
    drawText(pdfMoney(inv.paidCents), paidR, midY, { font: "F1", size: 9.5, color: PDF_DARK, align: "right" });
    drawText(inv.balanceCents < 0 ? `-${pdfMoney(-inv.balanceCents)}` : pdfMoney(inv.balanceCents), dueR, midY, { font: "F2", size: 9.5, color: PDF_DARK, align: "right" });
    y -= rowH;
    drawLine(M, y, R, y, PDF_LIGHT_LINE, 0.6);
  });
  if (data.invoices.length === 0) { drawText("No open invoices - this account is clear for this statement.", invX, y - 15, { font: "F3", size: 9, color: PDF_GREY }); y -= 26; }

  const totalsH = data.totalDueCents !== 0 ? 128 : 108;
  ensureSpace(totalsH + 10);
  y -= 16;
  const totX = 356; const totW = R - totX; const amtR = R - 10;
  drawText("Thank you for your business!", M, y - 2, { font: "F2", size: 10, color: PDF_DARK });
  drawText(data.totalDueCents > 0 ? "Please remit the total due shown." : data.totalDueCents < 0 ? "The credit shown stays on your account." : "This account is paid in full.", M, y - 16, { font: "F1", size: 8.5, color: PDF_GREY });
  const totalRow = (label: string, cents: number) => {
    drawText(label, totX, y, { font: "F1", size: 9.5, color: PDF_GREY });
    drawText(pdfMoney(cents), amtR, y, { font: "F1", size: 9.5, color: PDF_DARK, align: "right" });
    y -= 15;
  };
  totalRow("Total invoiced", data.totalInvoicedCents);
  totalRow("Total paid", data.totalPaidCents);
  drawLine(totX, y + 4, R, y + 4, PDF_LIGHT_LINE, 0.8);
  y -= 2;
  if (data.totalDueCents > 0) {
    drawRect(totX - 8, y - 19, totW + 16, 27, PDF_YELLOW);
    drawText("TOTAL DUE", totX, y, { font: "F2", size: 11, color: PDF_BLACK });
    drawText(pdfMoney(data.totalDueCents), amtR, y, { font: "F2", size: 13, color: PDF_BLACK, align: "right" });
    y -= 30;
  } else if (data.totalDueCents < 0) {
    drawText("ACCOUNT CREDIT", totX, y, { font: "F2", size: 10, color: PDF_GREEN });
    drawText(pdfMoney(-data.totalDueCents), amtR, y, { font: "F2", size: 11, color: PDF_GREEN, align: "right" });
    y -= 20;
  } else {
    drawText("TOTAL DUE", totX, y, { font: "F2", size: 10, color: PDF_GREEN });
    drawText("$0.00 - PAID IN FULL", amtR, y, { font: "F2", size: 10, color: PDF_GREEN, align: "right" });
    y -= 20;
  }

  const totalPages = pages.length;
  pages.forEach((pageOps, i) => {
    const footer: string[] = [];
    const pushText = (text: string, x: number, ty: number, size: number, color: PdfColor, align: "left" | "right" | "center", font: "F1" | "F2" | "F3" = "F1") => {
      const safe = pdfSafeText(text); let tx = x; const width = pdfTextWidth(safe, size, font === "F2");
      if (align === "right") tx = x - width; else if (align === "center") tx = x - width / 2;
      footer.push(`BT /${font} ${size} Tf ${colorOp(color)} 1 0 0 1 ${tx.toFixed(2)} ${ty.toFixed(2)} Tm (${pdfEscape(safe)}) Tj ET`);
    };
    footer.push(colorOp(PDF_LIGHT_LINE, true), `0.7 w ${M} 44 m ${R} 44 l S`);
    pushText("Thank you for your business - RIMA Supply Company", PW / 2, 32, 8, PDF_GREY, "center");
    pushText(`Page ${i + 1} of ${totalPages}`, R, 20, 7.5, PDF_GREY, "right");
    pushText(`Statement - ${data.periodLabel} - ${data.dateShort}`, M, 20, 7.5, PDF_GREY, "left");
    pageOps.push(...footer);
  });

  const encoder = new TextEncoder();
  const hasLogo = logo !== null;
  const imageId = 6;
  const firstPageId = 7;
  const pageIds = pages.map((_, i) => firstPageId + i * 2);
  const objects: Array<{ id: number; chunks: Array<string | Uint8Array> }> = [];
  objects.push({ id: 1, chunks: ["<< /Type /Catalog /Pages 2 0 R >>"] });
  objects.push({ id: 2, chunks: [`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`] });
  objects.push({ id: 3, chunks: ["<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"] });
  objects.push({ id: 4, chunks: ["<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"] });
  objects.push({ id: 5, chunks: ["<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>"] });
  if (hasLogo && logo) {
    objects.push({ id: imageId, chunks: [`<< /Type /XObject /Subtype /Image /Width 1078 /Height 766 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logo.length} >>\nstream\n`, logo, "\nendstream"] });
  }
  pages.forEach((pageOps, i) => {
    const pageId = firstPageId + i * 2; const contentId = pageId + 1;
    const resources = hasLogo ? `<< /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> /XObject << /Im1 ${imageId} 0 R >> >>` : `<< /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >>`;
    objects.push({ id: pageId, chunks: [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources ${resources} /Contents ${contentId} 0 R >>`] });
    const stream = pageOps.join("\n");
    objects.push({ id: contentId, chunks: [`<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}\nendstream`] });
  });
  objects.sort((a, b) => a.id - b.id);
  const chunks: Uint8Array[] = [];
  let length = 0;
  const pushChunk = (chunk: string | Uint8Array) => { const bytes = typeof chunk === "string" ? encoder.encode(chunk) : chunk; chunks.push(bytes); length += bytes.length; };
  pushChunk("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  const offsets = new Map<number, number>();
  for (const obj of objects) {
    offsets.set(obj.id, length);
    pushChunk(`${obj.id} 0 obj\n`);
    for (const chunk of obj.chunks) pushChunk(chunk);
    pushChunk("\nendobj\n");
  }
  const xrefStart = length;
  const maxId = Math.max(...objects.map((o) => o.id));
  let xref = `xref\n0 ${maxId + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= maxId; id += 1) xref += `${String(offsets.get(id) ?? 0).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  pushChunk(xref);
  const all = new Uint8Array(length);
  let pos = 0;
  for (const chunk of chunks) { all.set(chunk, pos); pos += chunk.length; }
  return new Blob([all.buffer as ArrayBuffer], { type: "application/pdf" });
}

async function downloadStatementPdf(filename: string, data: StatementPdfData) {
  const blob = await buildStatementPdfBlob(data);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = pdfFilename(filename);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 8000);
}

/* ---------- Branded purchase order document (same design language as the invoice) ---------- */
type PoPdfData = {
  poNumber: number | null;
  supplierLabel: string;
  statusLabel: string;
  dateLabel: string;
  dateShort: string;
  notes: string;
  belowMinOrder: boolean;
  minOrderCents: number;
  totalCents: number;
  unitCount: number;
  items: Array<{ title: string; supplierPartNumber: string; quantity: number; unitCostCents: number; lineTotalCents: number; thumbnailUrl: string | null }>;
};

function poPdfData(order: PurchaseOrder): PoPdfData {
  const statusLabel = order.status === "draft" ? "Draft" : order.status === "approved" ? "Approved" : order.status === "received" ? "Received" : "Cancelled";
  return {
    poNumber: order.po_number,
    supplierLabel: order.supplier_label,
    statusLabel,
    dateLabel: when(order.created_at),
    dateShort: shortDate(order.created_at),
    notes: order.notes,
    belowMinOrder: order.below_min_order,
    minOrderCents: order.min_order_cents,
    totalCents: order.total_cents,
    unitCount: order.unit_count,
    items: order.items.map((item) => ({ title: item.product_title, supplierPartNumber: item.supplier_part_number, quantity: item.quantity, unitCostCents: item.unit_cost_cents, lineTotalCents: item.line_total_cents, thumbnailUrl: item.thumbnail_url })),
  };
}

function PurchaseOrderDocument({ data }: { data: PoPdfData }) {
  return <article className="invoice-doc po-doc" aria-label={`Purchase order ${data.poNumber ?? ""} document`}>
    <header className="invoice-doc-head">
      <img src={rimaLogo} alt="RIMA Supply Company" />
      <div className="invoice-doc-title">
        <span>PURCHASE ORDER</span>
        <strong>{data.poNumber !== null ? `#${data.poNumber}` : ""}</strong>
        <small>{data.dateLabel}</small>
        <small>{data.statusLabel}</small>
      </div>
    </header>
    <div className="invoice-doc-meta">
      <section className="invoice-doc-billto" aria-label="Supplier">
        <h3>Supplier</h3>
        <strong>{data.supplierLabel}</strong>
        <span>Ordered by RIMA Supply Company</span>
      </section>
      <dl className="invoice-doc-details">
        <div><dt>PO #</dt><dd>{data.poNumber ?? "—"}</dd></div>
        <div><dt>Date</dt><dd>{data.dateShort}</dd></div>
        <div><dt>Status</dt><dd>{data.statusLabel}</dd></div>
        <div><dt>Lines</dt><dd>{data.items.length} · {data.unitCount} units</dd></div>
      </dl>
    </div>
    <table className="invoice-doc-table slip-pick-table">
      <thead><tr><th scope="col">Product</th><th scope="col" className="num">Qty</th><th scope="col" className="num">Unit cost</th><th scope="col" className="num">Amount</th></tr></thead>
      <tbody>
        {data.items.map((item, index) => <tr key={index}>
          <td><div className="slip-item">
            {item.thumbnailUrl ? <img className="slip-thumb" src={item.thumbnailUrl} alt="" loading="lazy" /> : <span className="slip-thumb slip-thumb-fallback" aria-hidden="true">{item.title.slice(0, 2).toUpperCase()}</span>}
            <span className="slip-item-copy"><span>{item.title}</span>{item.supplierPartNumber ? <em className="slip-part">{data.supplierLabel} # {item.supplierPartNumber}</em> : null}</span>
          </div></td>
          <td className="num slip-qty">{item.quantity}</td>
          <td className="num">{money(item.unitCostCents)}</td>
          <td className="num amount">{money(item.lineTotalCents)}</td>
        </tr>)}
        {data.items.length === 0 ? <tr><td colSpan={4} className="invoice-doc-empty">No lines on this purchase order.</td></tr> : null}
      </tbody>
    </table>
    <div className="invoice-doc-totals">
      <div className="invoice-doc-note">
        <strong>RIMA Supply Company</strong>
        <span>{data.belowMinOrder ? `Heads up: this order is below ${data.supplierLabel}'s ${money(data.minOrderCents)} minimum.` : "Please confirm receipt of this order. Thank you!"}</span>
        {data.notes ? <span>Notes: {data.notes}</span> : null}
      </div>
      <dl>
        <div className="invoice-doc-grand"><dt>Order total</dt><dd>{money(data.totalCents)}</dd></div>
      </dl>
    </div>
  </article>;
}

async function buildPoPdfBlob(data: PoPdfData): Promise<Blob> {
  const logo = await loadLogoBytes();
  const thumbUrls = [...new Set(data.items.map((item) => item.thumbnailUrl).filter((url): url is string => !!url))];
  const thumbByUrl = new Map<string, ThumbJpeg | null>();
  await Promise.all(thumbUrls.map(async (url) => { thumbByUrl.set(url, await loadThumbJpeg(url)); }));
  const PW = 612; const PH = 792; const M = 42; const R = PW - M; const W = R - M;
  const pages: string[][] = [];
  let ops: string[] = [];
  let y = PH;
  const thumbNameByUrl = new Map<string, string>();
  thumbUrls.forEach((url, i) => { if (thumbByUrl.get(url)) thumbNameByUrl.set(url, `T${i}`); });
  const drawText = (text: string, x: number, ty: number, opts: { font: "F1" | "F2" | "F3"; size: number; color: PdfColor; align?: "left" | "right" | "center" }) => {
    const safe = pdfSafeText(text);
    if (!safe) return;
    let tx = x;
    const width = pdfTextWidth(safe, opts.size, opts.font === "F2");
    if (opts.align === "right") tx = x - width;
    else if (opts.align === "center") tx = x - width / 2;
    ops.push(`BT /${opts.font} ${opts.size} Tf ${colorOp(opts.color)} 1 0 0 1 ${tx.toFixed(2)} ${ty.toFixed(2)} Tm (${pdfEscape(safe)}) Tj ET`);
  };
  const drawRect = (x: number, ry: number, w: number, h: number, color: PdfColor) => { ops.push(colorOp(color), `${x.toFixed(2)} ${ry.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`); };
  const drawLine = (x1: number, y1: number, x2: number, y2: number, color: PdfColor, width = 0.7) => { ops.push(colorOp(color, true), `${width} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`); };
  const startPage = (continued: boolean) => {
    ops = [];
    pages.push(ops);
    if (!continued) {
      ops.push(colorOp(PDF_BLACK), `0 ${PH - 104} ${PW} 104 re f`);
      ops.push(colorOp(PDF_YELLOW), `0 ${PH - 108} ${PW} 4 re f`);
      if (logo) {
        const logoW = 122; const logoH = (logoW * 766) / 1078;
        ops.push(`q ${logoW.toFixed(2)} 0 0 ${logoH.toFixed(2)} ${M} ${(PH - 10 - logoH).toFixed(2)} cm /Logo Do Q`);
      } else {
        drawText("RIMA", M, PH - 48, { font: "F2", size: 30, color: PDF_YELLOW });
        drawText("SUPPLY COMPANY", M + 1, PH - 66, { font: "F2", size: 10, color: PDF_WHITE });
      }
      drawText("PURCHASE ORDER", R, PH - 42, { font: "F2", size: 23, color: PDF_WHITE, align: "right" });
      drawText(data.poNumber !== null ? `PO #${data.poNumber}` : "Purchase order", R, PH - 64, { font: "F2", size: 12.5, color: PDF_YELLOW, align: "right" });
      drawText(data.dateLabel, R, PH - 81, { font: "F1", size: 9.5, color: [0.82, 0.83, 0.8], align: "right" });
      drawText(`Supplier: ${data.supplierLabel}`, R, PH - 95, { font: "F1", size: 8.5, color: [0.82, 0.83, 0.8], align: "right" });
      y = PH - 132;
    } else {
      ops.push(colorOp(PDF_BLACK), `0 ${PH - 40} ${PW} 40 re f`);
      ops.push(colorOp(PDF_YELLOW), `0 ${PH - 43} ${PW} 3 re f`);
      drawText("RIMA SUPPLY COMPANY", M, PH - 26, { font: "F2", size: 11, color: PDF_WHITE });
      drawText(`Purchase order ${data.poNumber !== null ? `#${data.poNumber}` : ""} (continued)`, R, PH - 26, { font: "F1", size: 9, color: [0.82, 0.83, 0.8], align: "right" });
      y = PH - 62;
    }
  };
  const ensureSpace = (needed: number) => { if (y - needed < 58) startPage(true); };
  startPage(false);

  const billTop = y;
  drawText("SUPPLIER", M, billTop, { font: "F2", size: 7.5, color: PDF_YELLOW_DARK });
  let by = billTop - 17;
  for (const line of wrapPdfText(data.supplierLabel, 288, 12.5, true)) { drawText(line, M, by, { font: "F2", size: 12.5, color: PDF_DARK }); by -= 15; }
  drawText("Ordered by RIMA Supply Company", M, by, { font: "F1", size: 9, color: PDF_GREY }); by -= 12.5;
  const billBottom = by + 4;
  const boxX = 372; const boxW = R - boxX;
  const boxRows: Array<[string, string]> = [
    ["PO #", data.poNumber !== null ? String(data.poNumber) : "-"],
    ["Date", data.dateShort],
    ["Status", data.statusLabel],
    ["Lines", `${data.items.length} - ${data.unitCount} units`],
  ];
  const boxH = boxRows.length * 15.5 + 13;
  drawRect(boxX, billTop + 6 - boxH, boxW, boxH, PDF_BOX);
  boxRows.forEach(([label, value], i) => {
    const ry = billTop - 8 - i * 15.5;
    drawText(label.toUpperCase(), boxX + 10, ry, { font: "F2", size: 7, color: PDF_GREY });
    const shown = value.length > 30 ? `${value.slice(0, 29)}...` : value;
    drawText(shown, R - 10, ry, { font: "F2", size: 9, color: PDF_DARK, align: "right" });
  });
  y = Math.min(billBottom, billTop + 6 - boxH) - 16;

  const textX = M + 52; const qtyCenter = M + 356; const unitR = M + 438; const amtR = R - 10;
  const drawTableHeader = () => {
    ensureSpace(30);
    drawRect(M, y - 22, W, 22, PDF_DARK);
    drawText("PRODUCT", textX, y - 15, { font: "F2", size: 8, color: PDF_WHITE });
    drawText("QTY", qtyCenter, y - 15, { font: "F2", size: 8, color: PDF_WHITE, align: "center" });
    drawText("UNIT COST", unitR, y - 15, { font: "F2", size: 8, color: PDF_WHITE, align: "right" });
    drawText("AMOUNT", amtR, y - 15, { font: "F2", size: 8, color: PDF_WHITE, align: "right" });
    y -= 22;
  };
  drawTableHeader();
  const rowH = 50;
  data.items.forEach((item, index) => {
    if (y - rowH < 58) { startPage(true); drawTableHeader(); }
    const rowTop = y;
    if (index % 2 === 1) drawRect(M, rowTop - rowH, W, rowH, PDF_SHADE);
    const thumbBoxX = M + 6; const thumbBoxY = rowTop - 43; const thumbBox = 36;
    const thumb = item.thumbnailUrl ? thumbByUrl.get(item.thumbnailUrl) : null;
    const thumbName = item.thumbnailUrl ? thumbNameByUrl.get(item.thumbnailUrl) : undefined;
    if (thumb && thumbName) {
      const scale = Math.min(thumbBox / thumb.w, thumbBox / thumb.h);
      const dw = thumb.w * scale; const dh = thumb.h * scale;
      const dx = thumbBoxX + (thumbBox - dw) / 2; const dy = thumbBoxY + (thumbBox - dh) / 2;
      ops.push(`q ${dw.toFixed(2)} 0 0 ${dh.toFixed(2)} ${dx.toFixed(2)} ${dy.toFixed(2)} cm /${thumbName} Do Q`);
    } else {
      drawRect(thumbBoxX, thumbBoxY, thumbBox, thumbBox, PDF_BOX);
      const initials = pdfSafeText(item.title).replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word.charAt(0)).join("").toUpperCase() || "-";
      drawText(initials, thumbBoxX + thumbBox / 2, thumbBoxY + 14, { font: "F2", size: 11, color: PDF_GREY, align: "center" });
    }
    let titleLines = wrapPdfText(item.title, qtyCenter - 40 - textX, 9.5, false);
    if (titleLines.length > 2) titleLines = [titleLines[0] ?? "", `${titleLines[1] ?? ""}...`];
    titleLines.forEach((line, li) => drawText(line, textX, rowTop - 19 - li * 11.5, { font: "F1", size: 9.5, color: PDF_DARK }));
    if (item.supplierPartNumber) drawText(`${data.supplierLabel} # ${item.supplierPartNumber}`, textX, rowTop - 19 - titleLines.length * 11.5, { font: "F1", size: 7.5, color: PDF_GREY });
    drawText(String(item.quantity), qtyCenter, rowTop - 29, { font: "F2", size: 14, color: PDF_DARK, align: "center" });
    drawText(pdfMoney(item.unitCostCents), unitR, rowTop - 27, { font: "F1", size: 9.5, color: PDF_DARK, align: "right" });
    drawText(pdfMoney(item.lineTotalCents), amtR, rowTop - 27, { font: "F2", size: 9.5, color: PDF_DARK, align: "right" });
    y -= rowH;
    drawLine(M, y, R, y, PDF_LIGHT_LINE, 0.6);
  });
  if (data.items.length === 0) { drawText("No lines on this purchase order.", textX, y - 16, { font: "F3", size: 9, color: PDF_GREY }); y -= 26; }

  const noteLines = data.notes ? wrapPdfText(`Notes: ${data.notes}`, W - 4, 9, false).slice(0, 3) : [];
  ensureSpace(70 + noteLines.length * 12);
  y -= 16;
  const totX = 356; const totW = R - totX;
  drawText("RIMA Supply Company", M, y - 2, { font: "F2", size: 10, color: PDF_DARK });
  drawText(data.belowMinOrder ? `Below ${data.supplierLabel}'s ${pdfMoney(data.minOrderCents)} minimum order.` : "Please confirm receipt of this order. Thank you!", M, y - 16, { font: "F1", size: 8.5, color: PDF_GREY });
  drawRect(totX - 8, y - 19, totW + 16, 27, PDF_BLACK);
  drawText("ORDER TOTAL", totX, y, { font: "F2", size: 11, color: PDF_WHITE });
  drawText(pdfMoney(data.totalCents), amtR, y, { font: "F2", size: 13, color: PDF_YELLOW, align: "right" });
  y -= 34;
  for (const line of noteLines) { drawText(line, M, y, { font: "F1", size: 9, color: PDF_GREY }); y -= 12; }

  const totalPages = pages.length;
  pages.forEach((pageOps, i) => {
    const footer: string[] = [];
    const pushText = (text: string, x: number, ty: number, size: number, color: PdfColor, align: "left" | "right" | "center", font: "F1" | "F2" | "F3" = "F1") => {
      const safe = pdfSafeText(text); let tx = x; const width = pdfTextWidth(safe, size, font === "F2");
      if (align === "right") tx = x - width; else if (align === "center") tx = x - width / 2;
      footer.push(`BT /${font} ${size} Tf ${colorOp(color)} 1 0 0 1 ${tx.toFixed(2)} ${ty.toFixed(2)} Tm (${pdfEscape(safe)}) Tj ET`);
    };
    footer.push(colorOp(PDF_LIGHT_LINE, true), `0.7 w ${M} 44 m ${R} 44 l S`);
    pushText("RIMA Supply Company - Purchase Order", PW / 2, 32, 8, PDF_GREY, "center");
    pushText(`Page ${i + 1} of ${totalPages}`, R, 20, 7.5, PDF_GREY, "right");
    pushText(data.poNumber !== null ? `PO #${data.poNumber} - ${data.dateShort}` : `Purchase order - ${data.dateShort}`, M, 20, 7.5, PDF_GREY, "left");
    pageOps.push(...footer);
  });

  const encoder = new TextEncoder();
  type ImageEntry = { name: string; thumb: ThumbJpeg };
  const images: ImageEntry[] = [];
  if (logo) images.push({ name: "Logo", thumb: { bytes: logo, w: 1078, h: 766 } });
  for (const url of thumbUrls) {
    const thumb = thumbByUrl.get(url);
    const name = thumbNameByUrl.get(url);
    if (thumb && name) images.push({ name, thumb });
  }
  const firstImageId = 6;
  const imageIdByName = new Map(images.map((entry, i) => [entry.name, firstImageId + i]));
  const firstPageId = firstImageId + images.length;
  const pageIds = pages.map((_, i) => firstPageId + i * 2);
  const objects: Array<{ id: number; chunks: Array<string | Uint8Array> }> = [];
  objects.push({ id: 1, chunks: ["<< /Type /Catalog /Pages 2 0 R >>"] });
  objects.push({ id: 2, chunks: [`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`] });
  objects.push({ id: 3, chunks: ["<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"] });
  objects.push({ id: 4, chunks: ["<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"] });
  objects.push({ id: 5, chunks: ["<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>"] });
  for (const entry of images) {
    const id = imageIdByName.get(entry.name) ?? firstImageId;
    objects.push({ id, chunks: [`<< /Type /XObject /Subtype /Image /Width ${entry.thumb.w} /Height ${entry.thumb.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${entry.thumb.bytes.length} >>\nstream\n`, entry.thumb.bytes, "\nendstream"] });
  }
  pages.forEach((pageOps, i) => {
    const pageId = firstPageId + i * 2; const contentId = pageId + 1;
    const xobjects = images.map((entry) => `/${entry.name} ${imageIdByName.get(entry.name) ?? firstImageId} 0 R`).join(" ");
    const resources = `<< /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> /XObject << ${xobjects} >> >>`;
    objects.push({ id: pageId, chunks: [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources ${resources} /Contents ${contentId} 0 R >>`] });
    const stream = pageOps.join("\n");
    objects.push({ id: contentId, chunks: [`<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}\nendstream`] });
  });
  objects.sort((a, b) => a.id - b.id);
  const chunks: Uint8Array[] = [];
  let length = 0;
  const pushChunk = (chunk: string | Uint8Array) => { const bytes = typeof chunk === "string" ? encoder.encode(chunk) : chunk; chunks.push(bytes); length += bytes.length; };
  pushChunk("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  const offsets = new Map<number, number>();
  for (const obj of objects) {
    offsets.set(obj.id, length);
    pushChunk(`${obj.id} 0 obj\n`);
    for (const chunk of obj.chunks) pushChunk(chunk);
    pushChunk("\nendobj\n");
  }
  const xrefStart = length;
  const maxId = Math.max(...objects.map((o) => o.id));
  let xref = `xref\n0 ${maxId + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= maxId; id += 1) xref += `${String(offsets.get(id) ?? 0).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  pushChunk(xref);
  const all = new Uint8Array(length);
  let pos = 0;
  for (const chunk of chunks) { all.set(chunk, pos); pos += chunk.length; }
  return new Blob([all.buffer as ArrayBuffer], { type: "application/pdf" });
}

async function downloadPoPdf(filename: string, data: PoPdfData) {
  const blob = await buildPoPdfBlob(data);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = pdfFilename(filename);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 8000);
}

function pdfFilename(filename: string): string {
  return filename.replace(/\.html?$/i, ".pdf");
}
function downloadPdf(filename: string, title: string, body: string) {
  const blob = buildPdfBlob(title, body);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = pdfFilename(filename);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 8000);
}
// Open a PDF blob in a new browser tab for viewing/printing.
// The browser's built-in PDF viewer has a reliable print button,
// which is more dependable than window.print() with CSS media queries.
function openPdfInTab(blob: Blob) {
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Real browser printing: renders the document into a hidden #print-root
// container (print-only via CSS), opens the print dialog, then cleans up.
// Pass a document component (InvoiceDocument, PackingSlipDocument, ...) as
// `doc` for branded output, or plain text `body` for simple summaries.
let printRoot: ReturnType<typeof createRoot> | null = null;
function printDocument(title: string, body: string, doc?: ReactNode) {
  let holder = document.getElementById("print-root");
  if (!holder) {
    holder = document.createElement("div");
    holder.id = "print-root";
    document.body.appendChild(holder);
  }
  const previousTitle = document.title;
  document.title = title;
  if (printRoot) { printRoot.unmount(); printRoot = null; }
  if (doc) {
    printRoot = createRoot(holder);
    flushSync(() => { printRoot!.render(<div className="print-doc">{doc}</div>); });
  } else {
    holder.innerHTML = `<div className="print-doc print-plain"><h1>${escapeHtml(title)}</h1><pre>${escapeHtml(body)}</pre></div>`;
  }
  const cleanup = () => {
    if (printRoot) { printRoot.unmount(); printRoot = null; }
    const el = document.getElementById("print-root");
    if (el) el.innerHTML = "";
    document.title = previousTitle;
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  // Give the browser a beat to paint the rendered document before opening
  // the print dialog; without this the preview can come up blank.
  window.setTimeout(() => { window.print(); }, 350);
  // Fallback cleanup in case afterprint doesn't fire.
  window.setTimeout(() => { if (document.getElementById("print-root")?.innerHTML) cleanup(); }, 8000);
}

function gmailComposeUrl(to: string, subject: string, body: string): string {
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to.trim())}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
function smsBodyFor(body: string): string {
  if (body.length <= 1100) return body;
  const lines = body.split("\n");
  const head = lines.slice(0, 14).join("\n");
  const tail = lines.slice(-6).join("\n");
  return `${head}\n…\n${tail}`;
}
function DeliveryActions({ subject, body, email, phone, filename, label, invoice, statementData }: { subject: string; body: string; email: string; phone: string; filename: string; label: string; invoice?: { order: AccountOrder; customer: Customer | null }; statementData?: StatementPdfData | null }) {
  const cleanPhone = phone.replace(/[^\d+]/g, "");
  const digits = cleanPhone.replace(/\D/g, "");
  const smsPhone = digits.length === 10 ? `+1${digits}` : digits.length === 11 && digits.startsWith("1") ? `+${digits}` : cleanPhone;
  const trimmedEmail = email.trim();
  const gmailHref = trimmedEmail ? gmailComposeUrl(trimmedEmail, subject, body) : "";
  const mailtoHref = trimmedEmail ? `mailto:${encodeURIComponent(trimmedEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` : "";
  // "?&body=" separator is read by Android Messages and iOS Messages.
  const textHref = cleanPhone ? `sms:${smsPhone}?&body=${encodeURIComponent(smsBodyFor(body))}` : "";
  const [note, setNote] = useState("");
  const printDoc = invoice ? <InvoiceDocument order={invoice.order} customer={invoice.customer} /> : statementData ? <StatementDocument data={statementData} /> : null;
  const doPrint = () => {
    // Open the branded PDF in a new tab — the browser's PDF viewer
    // has a reliable print button. Falls back to the old print
    // dialog only if PDF generation fails.
    setNote("Preparing print preview…");
    const openBranded = async () => {
      try {
        if (invoice) {
          const blob = await buildInvoicePdfBlob(invoicePdfData(invoice.order, invoice.customer));
          openPdfInTab(blob);
        } else if (statementData) {
          const blob = await buildStatementPdfBlob(statementData);
          openPdfInTab(blob);
        } else {
          printDocument(subject, body, printDoc ?? undefined);
        }
        setNote("");
      } catch {
        printDocument(subject, body, printDoc ?? undefined);
        setNote("");
      }
    };
    void openBranded();
  };
  const getPdf = () => {
    if (invoice) {
      setNote("Preparing your invoice PDF…");
      void downloadInvoicePdf(filename, invoice.order, invoice.customer)
        .then(() => setNote("Invoice PDF downloaded — open it from Downloads to print or share."))
        .catch(() => setNote("Could not build the PDF — try Print instead."));
    } else if (statementData) {
      setNote("Preparing your statement PDF…");
      void downloadStatementPdf(filename, statementData)
        .then(() => setNote("Statement PDF downloaded — open it from Downloads to print or share."))
        .catch(() => setNote("Could not build the PDF — try Print instead."));
    } else {
      doPrint();
    }
  };
  // Email: download the branded PDF first so it can be attached,
  // then open Gmail compose with the message text.
  const doEmail = (href: string) => {
    if (invoice) {
      setNote("Downloading PDF to attach…");
      void downloadInvoicePdf(filename, invoice.order, invoice.customer)
        .catch(() => {})
        .finally(() => {
          setNote("PDF downloaded — attach it to the email.");
          window.open(href, "_blank", "noopener,noreferrer");
          window.setTimeout(() => setNote(""), 6000);
        });
    } else if (statementData) {
      setNote("Downloading PDF to attach…");
      void downloadStatementPdf(filename, statementData)
        .catch(() => {})
        .finally(() => {
          setNote("PDF downloaded — attach it to the email.");
          window.open(href, "_blank", "noopener,noreferrer");
          window.setTimeout(() => setNote(""), 6000);
        });
    } else {
      window.open(href, "_blank", "noopener,noreferrer");
    }
  };
  return <div className="delivery-actions-wrap">
    <div className="delivery-actions" aria-label={`${label} delivery options`}>
      <button type="button" className="print-action" onClick={doPrint} aria-label={`Print ${label}`}><PrinterIcon /> Print / PDF</button>
      {gmailHref ? <button type="button" onClick={() => doEmail(gmailHref)} aria-label={`Email ${label} in Gmail`}><MailIcon /> Email (Gmail)</button> : <span aria-disabled="true" title="Add an email address to this customer"><MailIcon /> Email</span>}
      {mailtoHref ? <button type="button" onClick={() => doEmail(mailtoHref)} aria-label={`Email ${label} with mail app`}>Mail app</button> : null}
      {textHref ? <a href={textHref} aria-label={`Text ${label}`} onClick={() => setNote("Opening Messages…")}><MessageIcon /> Text</a> : <span aria-disabled="true" title="Add a phone number to this customer"><MessageIcon /> Text</span>}
      <button type="button" onClick={getPdf} aria-label={`Download PDF of ${label}`}><DownloadIcon /> Save PDF</button>
    </div>
    {note ? <p className="delivery-note" role="status">{note}</p> : null}
    {!trimmedEmail ? <p className="delivery-note">No email on file for this customer — add one on their account to email. {!cleanPhone ? "No phone on file either." : ""}</p> : !cleanPhone ? <p className="delivery-note">No phone on file — add one to text this customer.</p> : null}
  </div>;
}

function InvoiceDocument({ order, customer }: { order: AccountOrder; customer: Customer | null }) {
  const data = invoicePdfData(order, customer);
  return <article className="invoice-doc" aria-label={`Invoice ${data.invoiceNumber ?? ""} document`}>
    <header className="invoice-doc-head">
      <img src={rimaLogo} alt="RIMA Supply Company" />
      <div className="invoice-doc-title">
        <span>INVOICE</span>
        <strong>{data.invoiceNumber !== null ? `#${data.invoiceNumber}` : ""}</strong>
        <small>{data.dateLabel}</small>
        <small>Sold by {data.salesperson}</small>
      </div>
    </header>
    <div className="invoice-doc-meta">
      <section className="invoice-doc-billto" aria-label="Bill to">
        <h3>Bill to</h3>
        <strong>{data.customerDisplay}</strong>
        {data.contactName ? <span>Attn: {data.contactName}</span> : null}
        {data.addressLines.map((line) => <span key={line}>{line}</span>)}
        {data.phone ? <span>{data.phone}</span> : null}
        {data.email ? <span>{data.email}</span> : null}
        {!data.contactName && data.addressLines.length === 0 && !data.phone && !data.email ? <span>Walk-in sale</span> : null}
      </section>
      <dl className="invoice-doc-details">
        <div><dt>Invoice #</dt><dd>{data.invoiceNumber ?? "—"}</dd></div>
        <div><dt>Date</dt><dd>{data.dateShort}</dd></div>
        <div><dt>Salesperson</dt><dd>{data.salesperson}</dd></div>
        <div><dt>Status</dt><dd>{data.statusLabel}</dd></div>
      </dl>
    </div>
    <table className="invoice-doc-table">
      <thead><tr><th scope="col">Description</th><th scope="col" className="num">Qty</th><th scope="col" className="num">Unit price</th><th scope="col" className="num">Amount</th></tr></thead>
      <tbody>
        {data.items.map((item, index) => <tr key={index}>
          <td><span>{item.title}</span>{item.returned > 0 ? <em className="invoice-doc-returned">{item.returned} returned</em> : null}</td>
          <td className="num">{item.quantity}</td>
          <td className="num">{money(item.unitCents)}</td>
          <td className="num amount">{money(item.lineCents)}</td>
        </tr>)}
        {data.items.length === 0 ? <tr><td colSpan={4} className="invoice-doc-empty">No items on this invoice.</td></tr> : null}
      </tbody>
    </table>
    {data.returns.length > 0 ? <section className="invoice-doc-returns" aria-label="Returns and credits">
      <h3>Returns &amp; credits</h3>
      {data.returns.map((ret, index) => <div key={index} className="invoice-doc-return-row">
        <div><strong>{ret.dateLabel} · {ret.methodLabel}</strong><b>-{money(ret.totalCents)}</b></div>
        <ul>{ret.items.map((item, i) => <li key={i}>{item.quantity} × {item.title} — {item.reason}</li>)}</ul>
      </div>)}
    </section> : null}
    <div className="invoice-doc-totals">
      <div className="invoice-doc-note">
        <strong>Thank you for your business!</strong>
        <span>{data.balanceCents > 0 ? "Please remit the balance due shown." : data.balanceCents < 0 ? "The credit shown stays on your account." : "This invoice is paid in full."}</span>
      </div>
      <dl>
        <div><dt>Subtotal</dt><dd>{money(data.subtotalCents)}</dd></div>
        <div><dt>{data.taxLabel}</dt><dd>{money(data.taxCents)}</dd></div>
        <div className="invoice-doc-grand"><dt>Total</dt><dd>{money(data.totalCents)}</dd></div>
        <div><dt>Paid</dt><dd>{money(data.paidCents)}</dd></div>
        {data.balanceCents > 0 ? <div className="invoice-doc-due"><dt>Balance due on this invoice</dt><dd>{money(data.balanceCents)}</dd></div>
          : data.balanceCents < 0 ? <div className="invoice-doc-due credit"><dt>Credit on this invoice</dt><dd>{money(-data.balanceCents)}</dd></div>
          : <div className="invoice-doc-due credit"><dt>Balance due on this invoice</dt><dd>$0.00 · Paid in full</dd></div>}
        {data.showTotalBalance && data.totalBalanceCents !== null ? <div className="invoice-doc-total-balance"><dt>Total account balance due</dt><dd>{data.totalBalanceCents < 0 ? `${money(-data.totalBalanceCents)} credit` : money(data.totalBalanceCents)}</dd></div> : null}
      </dl>
    </div>
  </article>;
}

function InvoicePaymentForm({ order }: { order: AccountOrder }) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState(() => (order.balance_cents / 100).toFixed(2));
  const [method, setMethod] = useState<"cash" | "card" | "check">("cash");
  const [message, setMessage] = useState("");
  const amountCents = Math.round((Number(amount) || 0) * 100);
  const valid = Number.isFinite(amountCents) && amountCents > 0 && amountCents <= order.balance_cents;
  const accept = useMutation({
    mutationFn: () => api.recordPayment({ sale_id: order.id, amount_cents: amountCents, method }),
    onSuccess: async (result) => {
      if (!result.ok) { setMessage(result.error ?? "Could not record the payment."); return; }
      setMessage(result.balance_cents > 0 ? `Payment recorded · ${money(result.balance_cents)} still due on this invoice.` : "Payment recorded · invoice paid in full.");
      await queryClient.invalidateQueries();
    },
    onError: () => setMessage("Could not record the payment. Try again."),
  });
  return <form className="invoice-payment-form" onSubmit={(event) => { event.preventDefault(); setMessage(""); if (valid) accept.mutate(); }}>
    <div className="invoice-payment-head"><strong>Accept payment</strong><span>{money(order.balance_cents)} still owed</span></div>
    <div className="invoice-payment-fields">
      <label className="amount-field"><span>Amount</span><div><b>$</b><input aria-label={`Payment amount for invoice ${order.invoice_number ?? ""}`} type="number" inputMode="decimal" min="0.01" max={(order.balance_cents / 100).toFixed(2)} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></div></label>
      <fieldset className="method-options"><legend>Method</legend>{(["cash", "card", "check"] as const).map((value) => <label key={value} className={method === value ? "active" : ""}><input type="radio" name={`pay-method-${order.id}`} value={value} checked={method === value} onChange={() => setMethod(value)} />{value}</label>)}</fieldset>
    </div>
    {amount !== "" && !valid ? <p className="form-error">Enter an amount between $0.01 and {money(order.balance_cents)}.</p> : null}
    {message ? <p className="checkout-message" role="status">{message}</p> : null}
    <button className="primary-button invoice-pay-button" type="submit" disabled={!valid || accept.isPending}>{accept.isPending ? "Recording…" : `Accept payment · ${money(valid ? amountCents : 0)}`}</button>
  </form>;
}

function ReturnsHistory({ order }: { order: AccountOrder }) {
  if (order.returns.length === 0) return null;
  return <div className="return-history">{order.returns.map((ret) => <article key={ret.id} className="return-record">
    <div className="return-record-head"><span><ReturnIcon /><strong>{refundMethodLabel(ret.refund_method)}</strong></span><span>{when(ret.created_at)}</span><b>-{money(ret.total_cents)}</b></div>
    <ul>{ret.items.map((item) => <li key={item.id}><span>{item.quantity} × {item.product_title} — <em>{item.reason}</em></span><b>{money(item.line_total_cents)}</b></li>)}</ul>
    <small>{[ret.refunded_cents > 0 ? `${money(ret.refunded_cents)} handed back` : "", ret.credited_cents > 0 ? `${money(ret.credited_cents)} taken off the balance` : "", "Items restocked"].filter(Boolean).join(" · ")}</small>
  </article>)}</div>;
}

function InvoiceReturnForm({ order }: { order: AccountOrder }) {
  const queryClient = useQueryClient();
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [reasons, setReasons] = useState<Record<number, string>>({});
  const [method, setMethod] = useState<"cash" | "card" | "account_credit">(order.customer_id === null ? "cash" : "account_credit");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const lines = order.items.map((item) => ({ ...item, available: item.quantity - item.returned_quantity }));
  const selected = lines.filter((item) => (quantities[item.id] ?? 0) > 0);
  const goodsCents = selected.reduce((sum, item) => sum + item.unit_price_cents * (quantities[item.id] ?? 0), 0);
  const taxCents = order.tax_status === "exempt" ? 0 : Math.round(goodsCents * order.tax_rate_bps / 10000);
  const totalCents = goodsCents + taxCents;
  const reasonsOk = selected.length > 0 && selected.every((item) => (reasons[item.id] ?? "").trim().length > 0);
  const valid = selected.length > 0 && reasonsOk && totalCents > 0;
  const submit = useMutation({
    mutationFn: () => api.createReturn({ sale_id: order.id, refund_method: method, items: selected.map((item) => ({ sale_item_id: item.id, quantity: quantities[item.id] ?? 0, reason: (reasons[item.id] ?? "").trim() })) }),
    onSuccess: async (result) => {
      if (!result.ok) { setError(result.error ?? "Could not record the return."); return; }
      const parts = [`Return recorded · ${money(result.returned_cents)} back`];
      if (result.refunded_cents > 0) parts.push(`${money(result.refunded_cents)} refunded (${result.refund_method === "card" ? "card" : "cash"})`);
      if (result.credited_cents > 0) parts.push(`${money(result.credited_cents)} credited on account`);
      if (result.sale_balance_cents < 0) parts.push(`invoice now carries a ${money(-result.sale_balance_cents)} credit`);
      else if (result.sale_balance_cents > 0) parts.push(`${money(result.sale_balance_cents)} still due on this invoice`);
      else parts.push("invoice settled");
      setMessage(parts.join(" · "));
      setError("");
      setQuantities({});
      setReasons({});
      await queryClient.invalidateQueries();
    },
    onError: () => setError("Could not record the return. Try again."),
  });
  if (lines.every((item) => item.available <= 0)) {
    return order.returns.length > 0 ? <p className="return-all-done">Everything on this invoice has been returned and restocked.</p> : null;
  }
  const methodOptions: Array<{ value: "cash" | "card" | "account_credit"; label: string }> = [
    { value: "cash", label: "Cash" },
    { value: "card", label: "Card refund" },
    ...(order.customer_id !== null ? [{ value: "account_credit" as const, label: "Account credit" }] : []),
  ];
  return <form className="invoice-return-form" onSubmit={(event) => { event.preventDefault(); setError(""); setMessage(""); if (valid) submit.mutate(); }}>
    <div className="invoice-payment-head"><strong>Return items</strong><span>Goes back into stock</span></div>
    <div className="return-lines">{lines.map((item) => {
      const qty = Math.min(quantities[item.id] ?? 0, item.available);
      return <div key={item.id} className="return-line">
        <div className="return-line-main">
          <span><strong>{item.product_title}</strong><small>Sold {item.quantity} × {money(item.unit_price_cents)}{item.returned_quantity > 0 ? ` · ${item.returned_quantity} already returned` : ""} · {item.available} left to return</small></span>
          <div className="cart-qty return-qty">
            <button type="button" disabled={qty === 0} onClick={() => setQuantities((current) => ({ ...current, [item.id]: Math.max(0, qty - 1) }))} aria-label={`Return fewer of ${item.product_title}`}><MinusIcon /></button>
            <b aria-label={`Quantity to return of ${item.product_title}`}>{qty}</b>
            <button type="button" disabled={qty >= item.available} onClick={() => setQuantities((current) => ({ ...current, [item.id]: Math.min(item.available, qty + 1) }))} aria-label={`Return more of ${item.product_title}`}><PlusIcon /></button>
          </div>
        </div>
        {qty > 0 ? <label className="return-reason"><span>Reason — {item.product_title}</span><input aria-label={`Reason for returning ${item.product_title}`} value={reasons[item.id] ?? ""} onChange={(event) => setReasons((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="e.g. Wrong color, damaged, changed their mind" /></label> : null}
      </div>;
    })}</div>
    <fieldset className="method-options return-methods"><legend>Refund the customer</legend>{methodOptions.map((option) => <label key={option.value} className={method === option.value ? "active" : ""}><input type="radio" name={`return-method-${order.id}`} value={option.value} checked={method === option.value} onChange={() => setMethod(option.value)} />{option.label}</label>)}</fieldset>
    <p className="field-note">{method === "account_credit" ? "The refund comes off what this customer owes. If it is more than the balance on this invoice, the extra stays as a credit on their account." : method === "card" ? "Money already collected goes back to the card, up to what was paid on this invoice — anything beyond that comes off the balance instead." : "Money already collected is handed back in cash, up to what was paid on this invoice — anything beyond that comes off the balance instead."} Tax is refunded at the invoice&apos;s rate.</p>
    {selected.length > 0 && !reasonsOk ? <p className="form-error">Add a reason for each item being returned.</p> : null}
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    {message ? <p className="checkout-message" role="status">{message}</p> : null}
    <button className="primary-button invoice-pay-button" type="submit" disabled={!valid || submit.isPending}>{submit.isPending ? "Recording…" : totalCents > 0 ? `Record return · ${money(totalCents)}` : "Record return"}</button>
  </form>;
}

function WishlistSection({ customerId, items }: { customerId: number; items: WishlistItem[] }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"product" | "free">("free");
  const [productSearch, setProductSearch] = useState("");
  const productDeferred = useDeferredValue(productSearch);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [freeTitle, setFreeTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const openItems = items.filter((item) => item.status === "open");
  const doneItems = items.filter((item) => item.status === "done");
  const products = useQuery({ queryKey: ["wishlist-products", productDeferred], queryFn: () => api.listProducts({ query: productDeferred, mode: "all", limit: 20, offset: 0 }), enabled: mode === "product" && productDeferred.trim().length > 0 && !selectedProduct });
  const canAdd = mode === "product" ? selectedProduct !== null : freeTitle.trim().length > 0;
  const add = useMutation({
    mutationFn: () => api.addWishlistItem({ customer_id: customerId, product_id: mode === "product" ? (selectedProduct?.id ?? null) : null, title: mode === "free" ? freeTitle.trim() : "", notes: notes.trim() }),
    onSuccess: async (result) => {
      if (!result.ok) { setError(result.error ?? "Could not add that item."); return; }
      setError(""); setMessage(`Added “${result.item?.title ?? "item"}” to the wishlist.`);
      setFreeTitle(""); setNotes(""); setSelectedProduct(null); setProductSearch("");
      await queryClient.invalidateQueries();
    },
    onError: () => setError("Could not add that item. Try again."),
  });
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: "open" | "done" }) => api.setWishlistStatus({ id, status }),
    onSuccess: async (result) => { if (!result.ok) { setError(result.error ?? "Could not update that item."); return; } setError(""); await queryClient.invalidateQueries(); },
    onError: () => setError("Could not update that item. Try again."),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.deleteWishlistItem({ id }),
    onSuccess: async (result) => { if (!result.ok) { setError(result.error ?? "Could not remove that item."); return; } setConfirmDeleteId(null); setError(""); await queryClient.invalidateQueries(); },
    onError: () => setError("Could not remove that item. Try again."),
  });
  const saveEdit = useMutation({
    mutationFn: () => api.updateWishlistItem({ id: editingId ?? 0, title: editTitle.trim(), notes: editNotes.trim() }),
    onSuccess: async (result) => { if (!result.ok) { setError(result.error ?? "Could not save that edit."); return; } setEditingId(null); setError(""); await queryClient.invalidateQueries(); },
    onError: () => setError("Could not save that edit. Try again."),
  });
  const startEdit = (item: WishlistItem) => { setEditingId(item.id); setEditTitle(item.title); setEditNotes(item.notes); setError(""); };
  const renderItem = (item: WishlistItem) => {
    const isEditing = editingId === item.id;
    if (isEditing) {
      return <article key={item.id} className={`wishlist-item ${item.status}`}>
        <form className="wishlist-edit-form" onSubmit={(event) => { event.preventDefault(); if (editTitle.trim()) saveEdit.mutate(); }}>
          <label><span>What they asked about</span><input aria-label="Edit wishlist item" value={editTitle} onChange={(event) => setEditTitle(event.target.value)} /></label>
          <label><span>Notes</span><input aria-label="Edit wishlist notes" value={editNotes} onChange={(event) => setEditNotes(event.target.value)} placeholder="Qty, brand, details…" /></label>
          <div className="form-actions"><button type="button" className="secondary-button" onClick={() => setEditingId(null)}>Cancel</button><button type="submit" className="primary-button" disabled={!editTitle.trim() || saveEdit.isPending}>{saveEdit.isPending ? "Saving…" : "Save"}</button></div>
        </form>
      </article>;
    }
    return <article key={item.id} className={`wishlist-item ${item.status}`}>
      <div className="wishlist-item-main">
        <span className="wishlist-item-copy">
          <strong>{item.title}</strong>
          <span className="wishlist-meta">
            {item.product_id !== null ? <span className="wishlist-chip catalog">In catalog{item.product_price_cents !== null ? ` · ${money(item.product_price_cents)}` : ""}{item.product_part_number ? ` · ${item.product_part_number}` : ""}{item.product_in_stock !== null ? ` · ${item.product_in_stock} on hand` : ""}</span> : <span className="wishlist-chip not-carried">Not in catalog yet</span>}
            <span className="wishlist-date">Added {when(item.created_at)}</span>
            {item.status === "done" && item.done_at ? <span className="wishlist-date">Followed up {when(item.done_at)}</span> : null}
          </span>
          {item.notes ? <span className="wishlist-notes">{item.notes}</span> : null}
        </span>
      </div>
      <div className="wishlist-item-actions">
        {item.status === "open" ? <button type="button" className="primary-button wishlist-done-button" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ id: item.id, status: "done" })} aria-label={`Mark ${item.title} done`}><CheckIcon /> Mark done</button> : <button type="button" className="secondary-button wishlist-reopen-button" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ id: item.id, status: "open" })} aria-label={`Reopen ${item.title}`}>Reopen</button>}
        <button type="button" className="wishlist-text-button" onClick={() => startEdit(item)} aria-label={`Edit ${item.title}`}>Edit</button>
        {confirmDeleteId === item.id ? <span className="wishlist-delete-confirm">Remove? <button type="button" className="wishlist-text-button danger-link" disabled={remove.isPending} onClick={() => remove.mutate(item.id)}>Yes, remove</button> <button type="button" className="wishlist-text-button" onClick={() => setConfirmDeleteId(null)}>Keep</button></span> : <button type="button" className="wishlist-icon-button" onClick={() => setConfirmDeleteId(item.id)} aria-label={`Remove ${item.title} from wishlist`}><TrashIcon /></button>}
      </div>
    </article>;
  };
  return <section className={`wishlist-panel ${openItems.length > 0 ? "has-open" : ""}`} aria-label="Customer wishlist">
    <div className="wishlist-head">
      <div><p>WISHLIST · FOLLOW-UPS</p><h3><HeartIcon /> Wishlist</h3><span>Things they want a price on or asked about — jot it down here so you can check back with them.</span></div>
      <span className={`wishlist-open-count ${openItems.length > 0 ? "active" : ""}`} aria-label={`${openItems.length} open wishlist items`}>{openItems.length} open</span>
    </div>
    <form className="wishlist-add-form" onSubmit={(event) => { event.preventDefault(); setError(""); setMessage(""); if (canAdd) add.mutate(); }}>
      <div className="wishlist-mode-tabs" role="group" aria-label="Wishlist entry type">
        <button type="button" className={mode === "free" ? "active" : ""} onClick={() => setMode("free")}>Free text — not carried yet</button>
        <button type="button" className={mode === "product" ? "active" : ""} onClick={() => setMode("product")}>Existing product</button>
      </div>
      {mode === "free" ? <label className="wishlist-field"><span>What did they ask about?</span><input aria-label="Wishlist item — what they asked about" value={freeTitle} onChange={(event) => setFreeTitle(event.target.value)} placeholder="e.g. Indasa 6-inch discs, a cheaper clear coat, buffing pads…" /></label> : selectedProduct ? <div className="selected-customer wishlist-selected"><TagIcon /><span><strong>{selectedProduct.title}</strong><small>{money(selectedProduct.price_cents)}{selectedProduct.part_number ? ` · Part # ${selectedProduct.part_number}` : ""} · {selectedProduct.quantity} on hand</small></span><button type="button" onClick={() => setSelectedProduct(null)}>Change</button></div> : <>
        <SearchField value={productSearch} onChange={setProductSearch} placeholder="Search products or part #" label="Search products for wishlist" />
        {productSearch ? <div className="picker-results product-picker wishlist-picker">{products.data?.products.map((product) => <button key={product.id} type="button" onClick={() => { setSelectedProduct(product); setProductSearch(""); }}><span><strong>{product.title}</strong><small>{product.vendor}{product.part_number ? ` · Part # ${product.part_number}` : ""} · {product.quantity} on hand</small></span><b>{money(product.price_cents)}</b></button>)}{products.data && products.data.products.length === 0 ? <p className="quiet-empty field-list-note">No products match — switch to free text if you don&apos;t carry it yet.</p> : null}</div> : <p className="field-note">Start typing to find a product already in the catalog. Its current price shows on the wishlist entry.</p>}
      </>}
      <label className="wishlist-field"><span>Notes (optional)</span><input aria-label="Wishlist notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Qty they might want, brand, what they said, price they mentioned…" /></label>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {message ? <p className="checkout-message" role="status">{message}</p> : null}
      <button type="submit" className="primary-button wishlist-add-button" disabled={!canAdd || add.isPending}>{add.isPending ? "Adding…" : "Add to wishlist"}</button>
    </form>
    {openItems.length > 0 ? <div className="wishlist-open-banner" role="status"><HeartIcon /> <strong>{openItems.length} open item{openItems.length === 1 ? "" : "s"} to follow up on</strong><span> — still waiting on a price or a check-back.</span></div> : <p className="quiet-empty wishlist-empty">Nothing open right now. Add the next thing they ask about above so it doesn&apos;t get lost.</p>}
    <div className="wishlist-list">{openItems.map(renderItem)}</div>
    {doneItems.length > 0 ? <div className="wishlist-done-block">
      <button type="button" className="wishlist-done-toggle" onClick={() => setShowDone((value) => !value)} aria-expanded={showDone}>{showDone ? "Hide" : "Show"} followed-up items ({doneItems.length})</button>
      {showDone ? <div className="wishlist-list done">{doneItems.map(renderItem)}</div> : null}
    </div> : null}
  </section>;
}

function PreferenceRows({ items, kind, manual, variant, onAddToCart, onPin, pinPending }: {
  items: PreferenceItem[];
  kind: "most" | "recent";
  manual: ManualPreference[];
  variant: "account" | "checkout";
  onAddToCart?: (productId: number) => void;
  onPin?: (item: PreferenceItem) => void;
  pinPending?: boolean;
}) {
  if (items.length === 0) return <p className="quiet-empty pref-empty">Nothing here yet.</p>;
  return <div className="pref-list">{items.map((item) => {
    const pinnedEntry = manual.find((entry) => entry.product_id === item.product_id && entry.pinned);
    return <article key={`${kind}-${item.product_id}`} className="pref-row">
      <span className="pref-row-copy">
        <strong>{item.product_title}</strong>
        <span className="pref-meta">
          {kind === "most"
            ? <>{item.total_quantity} bought · {item.order_count} order{item.order_count === 1 ? "" : "s"}{item.typical_quantity > 0 ? ` · usually ${item.typical_quantity} at a time` : ""} · last {shortDate(item.last_bought_at)}</>
            : <>Last bought {shortDate(item.last_bought_at)} · {item.last_quantity} on that order · {item.total_quantity} all-time</>}
          {item.part_number ? ` · Part # ${item.part_number}` : ""}
          {` · ${money(item.price_cents)} · ${item.on_hand} on hand`}
        </span>
      </span>
      <span className="pref-row-actions">
        {pinnedEntry ? <span className="pref-pinned-badge"><PinIcon /> Pinned</span> : variant === "account" && onPin ? <button type="button" className="pref-text-button" disabled={pinPending} onClick={() => onPin(item)} aria-label={`Pin ${item.product_title} as a usual buy`}><PinIcon /> Pin</button> : null}
        {onAddToCart ? <button type="button" className="primary-button pref-add-button" disabled={item.on_hand === 0} onClick={() => onAddToCart(item.product_id)} aria-label={`Add ${item.product_title} to this sale`}>{item.on_hand === 0 ? "Out of stock" : "Add to sale"}</button> : null}
      </span>
    </article>;
  })}</div>;
}

function BuyingPreferencesSection({ customerId, variant, onAddToCart }: {
  customerId: number;
  variant: "account" | "checkout";
  onAddToCart?: (productId: number) => void;
}) {
  const queryClient = useQueryClient();
  const prefs = useQuery({ queryKey: ["customer-preferences", customerId], queryFn: () => api.getCustomerPreferences({ customer_id: customerId }) });
  const data = prefs.data;
  const [mode, setMode] = useState<"product" | "free">("free");
  const [productSearch, setProductSearch] = useState("");
  const productDeferred = useDeferredValue(productSearch);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [freeTitle, setFreeTitle] = useState("");
  const [note, setNote] = useState("");
  const [pinned, setPinned] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editPinned, setEditPinned] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const products = useQuery({ queryKey: ["preference-products", productDeferred], queryFn: () => api.listProducts({ query: productDeferred, mode: "all", limit: 20, offset: 0 }), enabled: variant === "account" && mode === "product" && productDeferred.trim().length > 0 && !selectedProduct });
  const canAdd = mode === "product" ? selectedProduct !== null : freeTitle.trim().length > 0;
  const refresh = async () => { await queryClient.invalidateQueries({ queryKey: ["customer-preferences", customerId] }); };
  const add = useMutation({
    mutationFn: () => api.addCustomerPreference({ customer_id: customerId, product_id: mode === "product" ? (selectedProduct?.id ?? null) : null, title: mode === "free" ? freeTitle.trim() : "", note: note.trim(), pinned }),
    onSuccess: async (result) => {
      if (!result.ok) { setError(result.error ?? "Could not save that preference."); return; }
      setError(""); setMessage(`Saved “${result.preference?.title ?? "preference"}”.`);
      setFreeTitle(""); setNote(""); setSelectedProduct(null); setProductSearch(""); setPinned(true);
      await refresh();
    },
    onError: () => setError("Could not save that preference. Try again."),
  });
  const pinFromHistory = useMutation({
    mutationFn: (item: PreferenceItem) => api.addCustomerPreference({ customer_id: customerId, product_id: item.product_id, title: "", note: "", pinned: true }),
    onSuccess: async (result) => {
      if (!result.ok) { setError(result.error ?? "Could not pin that item."); return; }
      setError(""); setMessage(`Pinned “${result.preference?.title ?? "item"}” as a usual buy.`);
      await refresh();
    },
    onError: () => setError("Could not pin that item. Try again."),
  });
  const setPinnedState = useMutation({
    mutationFn: ({ id, pinned: next }: { id: number; pinned: boolean }) => api.setCustomerPreferencePinned({ id, pinned: next }),
    onSuccess: async (result) => { if (!result.ok) { setError(result.error ?? "Could not update that preference."); return; } setError(""); await refresh(); },
    onError: () => setError("Could not update that preference. Try again."),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.deleteCustomerPreference({ id }),
    onSuccess: async (result) => { if (!result.ok) { setError(result.error ?? "Could not remove that preference."); return; } setConfirmDeleteId(null); setError(""); await refresh(); },
    onError: () => setError("Could not remove that preference. Try again."),
  });
  const saveEdit = useMutation({
    mutationFn: () => api.updateCustomerPreference({ id: editingId ?? 0, title: editTitle.trim(), note: editNote.trim(), pinned: editPinned }),
    onSuccess: async (result) => { if (!result.ok) { setError(result.error ?? "Could not save that edit."); return; } setEditingId(null); setError(""); await refresh(); },
    onError: () => setError("Could not save that edit. Try again."),
  });
  const startEdit = (entry: ManualPreference) => { setEditingId(entry.id); setEditTitle(entry.title); setEditNote(entry.note); setEditPinned(entry.pinned); setError(""); };
  const pinnedManual = (data?.manual ?? []).filter((entry) => entry.pinned);
  const noteManual = (data?.manual ?? []).filter((entry) => !entry.pinned);
  const renderManual = (entry: ManualPreference) => {
    if (editingId === entry.id) {
      return <article key={entry.id} className="pref-manual-item editing">
        <form className="wishlist-edit-form" onSubmit={(event) => { event.preventDefault(); if (editTitle.trim()) saveEdit.mutate(); }}>
          <label><span>Preference</span><input aria-label="Edit preference" value={editTitle} onChange={(event) => setEditTitle(event.target.value)} /></label>
          <label><span>Note</span><input aria-label="Edit preference note" value={editNote} onChange={(event) => setEditNote(event.target.value)} placeholder="Brand, size, who to ask for…" /></label>
          <label className="pref-pin-check"><input type="checkbox" checked={editPinned} onChange={(event) => setEditPinned(event.target.checked)} /> Pinned — always show this first</label>
          <div className="form-actions"><button type="button" className="secondary-button" onClick={() => setEditingId(null)}>Cancel</button><button type="submit" className="primary-button" disabled={!editTitle.trim() || saveEdit.isPending}>{saveEdit.isPending ? "Saving…" : "Save"}</button></div>
        </form>
      </article>;
    }
    return <article key={entry.id} className={`pref-manual-item ${entry.pinned ? "pinned" : ""}`}>
      <div className="pref-row-copy">
        <strong>{entry.pinned ? <><PinIcon /> </> : null}{entry.title}</strong>
        <span className="pref-meta">
          {entry.product_id !== null ? <span className="wishlist-chip catalog">In catalog{entry.product_price_cents !== null ? ` · ${money(entry.product_price_cents)}` : ""}{entry.product_part_number ? ` · ${entry.product_part_number}` : ""}{entry.product_in_stock !== null ? ` · ${entry.product_in_stock} on hand` : ""}</span> : <span className="wishlist-chip not-carried">Team note</span>}
          <span className="wishlist-date">{entry.pinned ? "Pinned by the team" : "Team note"} · {shortDate(entry.created_at)}</span>
        </span>
        {entry.note ? <span className="wishlist-notes">{entry.note}</span> : null}
      </div>
      <span className="pref-row-actions">
        {onAddToCart && entry.product_id !== null ? <button type="button" className="primary-button pref-add-button" disabled={(entry.product_in_stock ?? 0) === 0} onClick={() => onAddToCart(entry.product_id ?? 0)} aria-label={`Add ${entry.title} to this sale`}>{(entry.product_in_stock ?? 0) === 0 ? "Out of stock" : "Add to sale"}</button> : null}
        {variant === "account" ? <>
          <button type="button" className="pref-text-button" disabled={setPinnedState.isPending} onClick={() => setPinnedState.mutate({ id: entry.id, pinned: !entry.pinned })} aria-label={`${entry.pinned ? "Unpin" : "Pin"} ${entry.title}`}>{entry.pinned ? "Unpin" : "Pin"}</button>
          <button type="button" className="pref-text-button" onClick={() => startEdit(entry)} aria-label={`Edit preference ${entry.title}`}>Edit</button>
          {confirmDeleteId === entry.id ? <span className="wishlist-delete-confirm">Remove? <button type="button" className="pref-text-button danger-link" disabled={remove.isPending} onClick={() => remove.mutate(entry.id)}>Yes, remove</button> <button type="button" className="pref-text-button" onClick={() => setConfirmDeleteId(null)}>Keep</button></span> : <button type="button" className="wishlist-icon-button" onClick={() => setConfirmDeleteId(entry.id)} aria-label={`Remove preference ${entry.title}`}><TrashIcon /></button>}
        </> : null}
      </span>
    </article>;
  };

  if (variant === "checkout") {
    return <section className="preferences-panel checkout-preferences" aria-label="Customer buying preferences">
      <div className="wishlist-head">
        <div><p>USUALLY BUYS</p><h3><StarIcon /> What they usually get</h3></div>
      </div>
      {prefs.isPending ? <p className="quiet-empty pref-empty">Loading what they usually buy…</p> : data ? <>
        <p className="pref-summary" role="status">{data.summary}</p>
        {data.manual.length > 0 ? <div className="pref-manual-list">{data.manual.map(renderManual)}</div> : null}
        {data.has_history ? <>
          <h4 className="pref-subhead">Most bought</h4>
          <PreferenceRows items={data.most_bought.slice(0, 5)} kind="most" manual={data.manual} variant="checkout" onAddToCart={onAddToCart} />
          <h4 className="pref-subhead">Recently bought</h4>
          <PreferenceRows items={data.recent.slice(0, 5)} kind="recent" manual={data.manual} variant="checkout" onAddToCart={onAddToCart} />
        </> : data.manual.length === 0 ? <p className="quiet-empty pref-empty">No order history yet — usual items will appear after their first sale. Pin or note a preference from their account page.</p> : null}
      </> : <p className="quiet-empty pref-empty">Could not load buying preferences.</p>}
    </section>;
  }

  return <section className="preferences-panel" aria-label="Customer buying preferences">
    <div className="wishlist-head">
      <div><p>BUYING PREFERENCES · LEARNED FROM ORDERS</p><h3><StarIcon /> Usually buys</h3><span>Most-bought and recently-bought items from this customer&apos;s order history — plus anything the team pins or notes by hand.</span></div>
      {data ? <span className={`wishlist-open-count ${data.has_history ? "active" : ""}`}>{data.total_orders} order{data.total_orders === 1 ? "" : "s"}</span> : null}
    </div>
    {prefs.isPending ? <p className="quiet-empty pref-empty">Learning from their order history…</p> : data ? <>
      <p className="pref-summary" role="status">{data.summary}</p>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {message ? <p className="checkout-message" role="status">{message}</p> : null}
      <h4 className="pref-subhead">Most bought</h4>
      <PreferenceRows items={data.most_bought} kind="most" manual={data.manual} variant="account" onPin={(item) => pinFromHistory.mutate(item)} pinPending={pinFromHistory.isPending} />
      <h4 className="pref-subhead">Recently bought</h4>
      <PreferenceRows items={data.recent} kind="recent" manual={data.manual} variant="account" onPin={(item) => pinFromHistory.mutate(item)} pinPending={pinFromHistory.isPending} />
      <h4 className="pref-subhead">Pinned &amp; noted by the team</h4>
      {data.manual.length === 0 ? <p className="quiet-empty pref-empty">Nothing pinned yet. Pin a usual item above, or add one below — a brand they insist on, a size they always take, anything the next person at the counter should know.</p> : <div className="pref-manual-list">{[...pinnedManual, ...noteManual].map(renderManual)}</div>}
      <form className="wishlist-add-form pref-add-form" onSubmit={(event) => { event.preventDefault(); setError(""); setMessage(""); if (canAdd) add.mutate(); }}>
        <div className="wishlist-mode-tabs" role="group" aria-label="Preference entry type">
          <button type="button" className={mode === "free" ? "active" : ""} onClick={() => setMode("free")}>Free text / note</button>
          <button type="button" className={mode === "product" ? "active" : ""} onClick={() => setMode("product")}>Existing product</button>
        </div>
        {mode === "free" ? <label className="wishlist-field"><span>What do they usually get, or what should the team know?</span><input aria-label="Preference — what they usually get" value={freeTitle} onChange={(event) => setFreeTitle(event.target.value)} placeholder="e.g. Indasa 6-inch hook-and-loop discs, 80 grit — never Norton" /></label> : selectedProduct ? <div className="selected-customer wishlist-selected"><TagIcon /><span><strong>{selectedProduct.title}</strong><small>{money(selectedProduct.price_cents)}{selectedProduct.part_number ? ` · Part # ${selectedProduct.part_number}` : ""} · {selectedProduct.quantity} on hand</small></span><button type="button" onClick={() => setSelectedProduct(null)}>Change</button></div> : <>
          <SearchField value={productSearch} onChange={setProductSearch} placeholder="Search products or part #" label="Search products for preference" />
          {productSearch ? <div className="picker-results product-picker wishlist-picker">{products.data?.products.map((product) => <button key={product.id} type="button" onClick={() => { setSelectedProduct(product); setProductSearch(""); }}><span><strong>{product.title}</strong><small>{product.vendor}{product.part_number ? ` · Part # ${product.part_number}` : ""} · {product.quantity} on hand</small></span><b>{money(product.price_cents)}</b></button>)}{products.data && products.data.products.length === 0 ? <p className="quiet-empty field-list-note">No products match — switch to free text to note it anyway.</p> : null}</div> : <p className="field-note">Start typing to pin a product from the catalog.</p>}
        </>}
        <label className="wishlist-field"><span>Note (optional)</span><input aria-label="Preference note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Grit, size, brand, who orders it, how many they take…" /></label>
        <label className="pref-pin-check"><input type="checkbox" checked={pinned} onChange={(event) => setPinned(event.target.checked)} /> Pin it — always show this first on the account and at checkout</label>
        <button type="submit" className="primary-button wishlist-add-button" disabled={!canAdd || add.isPending}>{add.isPending ? "Saving…" : pinned ? "Pin preference" : "Save preference note"}</button>
      </form>
    </> : <p className="quiet-empty pref-empty">Could not load buying preferences.</p>}
  </section>;
}

function AccountSheet({ id, onClose }: { id: number; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const account = useQuery({ queryKey: ["customer-account", id], queryFn: () => api.getCustomerAccount({ id }) });
  const data: Account | undefined = account.data;
  const customer = data?.customer;
  const address = customer ? [customer.delivery_street, customer.delivery_city, customer.delivery_state, customer.delivery_zip].filter(Boolean).join(", ") : "";
  const deliveryEmail = customer?.ap_email || customer?.email || "";
  const deliveryPhone = customer?.ap_phone || customer?.phone || "";
  const [printToggleError, setPrintToggleError] = useState("");
  const togglePrintBalance = useMutation({
    mutationFn: (next: boolean) => {
      if (!customer) throw new Error("No customer");
      const { id: _id, tax_rate_bps: _rate, tax_rate_source: _source, balance_cents: _balance, open_wishlist_count: _wish, created_at: _created, ...fields } = customer;
      return api.updateCustomer({ id: customer.id, ...fields, print_balance_due: next });
    },
    onSuccess: async (result) => {
      if (!result.ok) { setPrintToggleError(result.error ?? "Could not save that setting."); return; }
      setPrintToggleError("");
      await queryClient.invalidateQueries();
    },
    onError: () => setPrintToggleError("Could not save that setting. Try again."),
  });
  return <div className="sheet-backdrop" role="presentation"><section className="account-sheet" role="dialog" aria-modal="true" aria-labelledby="account-title"><div className="sheet-handle" /><header className="sheet-header"><div><p>CUSTOMER ACCOUNT</p><h2 id="account-title">{customer?.business_name || customer?.name || "Loading…"}</h2>{customer?.business_name ? <span className="account-contact-name">{customer.name}</span> : null}</div><div className="sheet-actions">{customer && !editing ? <button className="secondary-button edit-customer-button" onClick={() => setEditing(true)}>Edit</button> : null}<button className="icon-button" onClick={onClose} aria-label="Close customer account"><CloseIcon /></button></div></header>{account.isPending ? <div className="empty-state"><p>Loading account…</p></div> : customer ? editing ? <div className="account-edit"><CustomerForm initial={customer} onCancel={() => setEditing(false)} onDone={() => { setEditing(false); void queryClient.invalidateQueries(); }} /></div> : <><div className="account-balance"><span>{customer.balance_cents < 0 ? "Account credit" : "Open balance"}</span><strong>{money(Math.abs(customer.balance_cents))}</strong></div><div className="print-balance-setting"><button type="button" role="switch" aria-checked={customer.print_balance_due} aria-label={`Print total balance due on receipts and invoices for ${customer.business_name || customer.name}`} className="print-balance-toggle" disabled={togglePrintBalance.isPending} onClick={() => { setPrintToggleError(""); togglePrintBalance.mutate(!customer.print_balance_due); }}><span className="toggle-track" aria-hidden="true"><span className="toggle-thumb" /></span><span className="toggle-copy"><strong>Print total balance due on receipts &amp; invoices</strong><small>{customer.print_balance_due ? "On — every slip for this customer also shows their total account balance due." : "Off — slips show only that invoice's amounts, not the total account balance due."}</small></span></button>{printToggleError ? <p className="form-error" role="alert">{printToggleError}</p> : null}</div><BuyingPreferencesSection customerId={customer.id} variant="account" /><WishlistSection customerId={customer.id} items={data.wishlist} /><div className="statement-delivery"><div><strong>Customer statement</strong><span>Print, email, or text this statement.</span></div><DeliveryActions subject={`RIMA account statement — ${customer.business_name || customer.name}`} body={statementText(data, customer)} email={deliveryEmail} phone={deliveryPhone} filename={`RIMA-statement-${(customer.business_name || customer.name).replace(/[^a-z0-9]+/gi, "-")}.html`} label="statement" statementData={statementDataForAccount(data, customer)} /></div><div className="customer-detail-grid"><section><h3>Main contact</h3><p>{customer.name}</p><span>{customer.phone || "No phone"}</span><span>{customer.email || "No email"}</span></section><section><h3>Delivery</h3><p>{address || "No delivery address"}</p></section><section><h3>Accounts payable</h3><p>{customer.ap_name || "No AP contact"}</p><span>{customer.ap_phone || "No AP phone"}</span><span>{customer.ap_email || "No AP email"}</span></section><section><h3>Billing & tax</h3><p>{taxDescription(customer)}</p><span>{customer.tax_id ? `Tax ID ${customer.tax_id}` : "No tax ID"}</span><span>{customer.card_last4 ? `Card ending ${customer.card_last4}${customer.card_expiry ? ` · expires ${customer.card_expiry}` : ""}` : "No card on file"}</span>{customer.cardholder_name ? <span>{customer.cardholder_name}</span> : null}<span>{customer.print_balance_due ? "Total balance due prints on receipts & invoices" : "Total balance due does NOT print on receipts & invoices"}</span></section></div>{customer.notes ? <p className="customer-notes">{customer.notes}</p> : null}<div className="history-grid"><section><div className="mini-heading"><h3>Invoices</h3><span>{data.orders.length}</span></div>{data.orders.length === 0 ? <p className="quiet-empty">No sales yet.</p> : <div className="history-list">{data.orders.map((order) => <article key={order.id} className="history-card"><div className="invoice-card-head"><div><strong>{order.invoice_number !== null ? `Invoice #${order.invoice_number}` : "Invoice"}</strong><span>{money(order.total_cents)} · {when(order.created_at)} · {order.status} · Sold by {order.salesperson}</span></div><span className={`invoice-customer-balance ${customer.balance_cents > 0 ? "due" : ""}`}><small>Customer balance</small><b>{money(customer.balance_cents)}</b></span></div>{order.balance_cents > 0 ? <b>{money(order.balance_cents)} due on this invoice</b> : order.balance_cents < 0 ? <b className="paid-mark">{money(-order.balance_cents)} credit on account</b> : <b className="paid-mark">Paid</b>}<InvoiceDocument order={order} customer={customer} /><DeliveryActions subject={`RIMA Invoice #${order.invoice_number ?? order.id}`} body={invoiceText(order, customer)} email={deliveryEmail} phone={deliveryPhone} filename={`RIMA-invoice-${order.invoice_number ?? order.id}.html`} label={`invoice ${order.invoice_number ?? order.id}`} invoice={{ order, customer }} />{order.balance_cents > 0 ? <InvoicePaymentForm key={`${order.id}:${order.balance_cents}`} order={order} /> : null}<ReturnsHistory order={order} /><InvoiceReturnForm key={`${order.id}:${order.returns.map((ret) => ret.id).join(",")}`} order={order} /></article>)}</div>}</section><section><div className="mini-heading"><h3>Payment history</h3><span>{data.payments.length}</span></div>{data.payments.length === 0 ? <p className="quiet-empty">No payments yet.</p> : <div className="payment-list">{data.payments.map((payment) => <div key={payment.id}><span><b>{payment.amount_cents < 0 ? `${payment.method} refund` : payment.method}</b>{when(payment.created_at)}</span><strong>{money(payment.amount_cents)}</strong></div>)}</div>}</section></div></> : <div className="empty-state"><h2>Customer not found</h2></div>}</section></div>;
}

function CustomersView() {
  const queryClient = useQueryClient(); const [search, setSearch] = useState(""); const deferred = useDeferredValue(search); const [adding, setAdding] = useState(false); const [selected, setSelected] = useState<number | null>(null);
  const customers = useQuery({ queryKey: ["customers", deferred], queryFn: () => api.listCustomers({ query: deferred, limit: 100 }) });
  return <><section className="plain-command"><div><p>CUSTOMERS</p><h1>Customer accounts</h1></div><button className="primary-button" onClick={() => setAdding((value) => !value)}>{adding ? "Cancel" : "Add customer"}</button></section>{adding ? <section className="form-panel"><h2>New customer</h2><CustomerForm onDone={(customer) => { setAdding(false); void queryClient.invalidateQueries(); setSelected(customer.id); }} /></section> : null}<div className="customer-search"><SearchField value={search} onChange={setSearch} placeholder="Search business, name, phone, or email" label="Search customers" /></div><section className="inventory-section"><div className="section-heading"><div><p>DIRECTORY</p><h1>{search ? `Matches for “${search}”` : "All customers"}</h1></div><span>{customers.data?.total ?? 0} customers</span></div>{customers.isPending ? <div className="loading-list"><span /><span /></div> : null}{customers.data?.customers.length === 0 ? <div className="empty-state"><h2>{search ? "No customers found" : "No customers yet"}</h2><p>{search ? "Try another name, phone, or email." : "Add the first customer to start their account."}</p>{!search ? <button className="primary-button" onClick={() => setAdding(true)}>Add customer</button> : null}</div> : <div className="customer-list">{customers.data?.customers.map((customer) => <button key={customer.id} onClick={() => setSelected(customer.id)}><span className="customer-avatar">{(customer.business_name || customer.name).slice(0, 1).toUpperCase()}</span><span className="customer-copy"><strong>{customer.business_name || customer.name}</strong><small>{customer.business_name ? `${customer.name} · ${customer.phone || customer.email || "No contact details"}` : customer.phone || customer.email || "No contact details"}</small>{customer.open_wishlist_count > 0 ? <span className="wishlist-list-badge"><HeartIcon /> {customer.open_wishlist_count} open on wishlist</span> : null}</span><span className={`balance-label ${customer.balance_cents > 0 ? "due" : ""}`}><b>{money(customer.balance_cents)}</b><small>balance</small></span><ChevronIcon /></button>)}</div>}</section>{selected !== null ? <AccountSheet id={selected} onClose={() => setSelected(null)} /> : null}</>;
}

type FieldLine = { product_id: number; title: string; part_number: string; price_cents: number; on_hand: number; quantity: number; thumbnail_url: string | null };

function fieldSnapshot(lines: FieldLine[], notes: string) {
  return JSON.stringify({ items: lines.map((line) => [line.product_id, line.quantity]), notes });
}

/** Voice notes for field orders: record via the browser's Web Speech API
 *  (Chrome/Edge), get a live transcript, then ask the server's AI for a
 *  summary + action items. Only transcript text is sent — no audio stored. */
function VoiceNotes({ onAddToNotes, disabled }: { onAddToNotes: (text: string) => void; disabled: boolean }) {
  const [supported] = useState(() => typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition));
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [summary, setSummary] = useState<string | null>(null);
  const [actionItems, setActionItems] = useState<string[]>([]);
  const [summarizing, setSummarizing] = useState(false);
  const [noteError, setNoteError] = useState("");
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const stopRecording = () => {
    try { recognitionRef.current?.stop(); } catch { /* already stopped */ }
    recognitionRef.current = null;
    setRecording(false);
  };

  const startRecording = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setNoteError("Voice notes need Chrome or Edge."); return; }
    setNoteError("");
    setSummary(null);
    setActionItems([]);
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.onresult = (event: SpeechRecognitionEvent) => {
      let full = "";
      for (let i = 0; i < event.results.length; i++) full += event.results[i][0].transcript;
      setTranscript(full);
    };
    rec.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setNoteError("Microphone blocked — allow mic access in the browser and try again.");
      } else if (event.error === "no-speech") {
        setNoteError("Didn't catch that — try speaking closer to the mic.");
      } else {
        setNoteError("Voice recording hit a snag. Try again.");
      }
      stopRecording();
    };
    rec.onend = () => { recognitionRef.current = null; setRecording(false); };
    try {
      rec.start();
      recognitionRef.current = rec;
      setRecording(true);
    } catch {
      setNoteError("Could not start the microphone. Try again.");
    }
  };

  useEffect(() => () => { try { recognitionRef.current?.abort(); } catch { /* noop */ } }, []);

  const summarize = async () => {
    const text = transcript.trim();
    if (!text || summarizing) return;
    setSummarizing(true);
    setNoteError("");
    try {
      const result = await api.summarizeVoiceNote({ transcript: text });
      if (!result.ok) {
        setNoteError(result.error ?? "Could not summarize that note.");
      } else {
        setSummary(result.summary ?? "");
        setActionItems(result.action_items ?? []);
      }
    } catch (err) {
      setNoteError(err instanceof Error ? err.message : "Could not summarize that note.");
    } finally {
      setSummarizing(false);
    }
  };

  const clear = () => {
    stopRecording();
    setTranscript("");
    setSummary(null);
    setActionItems([]);
    setNoteError("");
  };

  const addToNotes = () => {
    const ts = new Date().toLocaleString("en-US", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" });
    let text = `Voice note (${ts}):\n${summary ?? transcript.trim()}`;
    if (actionItems.length > 0) text += `\nAction items:\n${actionItems.map((item) => `• ${item}`).join("\n")}`;
    onAddToNotes(text);
    setNoteError("");
  };

  return (
    <div className="voice-notes">
      <div className="voice-notes-head"><MicIcon /><h3>Voice notes</h3></div>
      {!supported ? <p className="voice-notes-unsupported">Voice notes need Chrome or Edge — the transcript won't work in this browser.</p> : (
        <>
          <div className="voice-notes-controls">
            {recording
              ? <button type="button" className="voice-notes-stop" onClick={stopRecording}>■ Stop</button>
              : <button type="button" className="secondary-button" onClick={startRecording} disabled={disabled}><MicIcon /> Record</button>}
            <button type="button" className="secondary-button" onClick={summarize} disabled={disabled || summarizing || transcript.trim().length === 0}>{summarizing ? "Summarizing…" : "✨ Summarize"}</button>
            <button type="button" className="link-button" onClick={clear} disabled={disabled || (transcript.length === 0 && summary === null)}>Clear</button>
          </div>
          {recording ? <p className="voice-notes-listening" role="status"><span className="voice-notes-dot" /> Listening — speak now</p> : null}
          {transcript ? <div className="voice-notes-transcript"><span>Transcript</span><p>{transcript}</p></div> : null}
          {summarizing ? <p className="voice-notes-loading" role="status">Writing the summary…</p> : null}
          {noteError ? <p className="form-error" role="alert">{noteError}</p> : null}
          {summary !== null ? (
            <div className="voice-notes-summary">
              <span>Summary</span>
              <p>{summary}</p>
              {actionItems.length > 0 ? (<><span>Action items</span><ul>{actionItems.map((item, i) => <li key={i}>{item}</li>)}</ul></>) : null}
              <button type="button" className="primary-button" onClick={addToNotes} disabled={disabled}>Add to order notes</button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function FieldOrderEditor({ orderId, initialOrder, onClose }: { orderId: string | null; initialOrder: FieldOrder | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [currentId, setCurrentId] = useState<string | null>(orderId);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const customerDeferred = useDeferredValue(customerSearch);
  const [createdBy, setCreatedBy] = useState<string>(initialOrder?.created_by ?? "Randy");
  const teamForField = useQuery({ queryKey: ["sales-team"], queryFn: () => api.listSalesTeam({}) });
  const fieldTeamNames = (teamForField.data?.members.filter((m) => m.active).map((m) => m.name) ?? []);
  const fieldPeople = fieldTeamNames.length ? fieldTeamNames : ["Randy", "Nathan", "Alan"];
  const [lines, setLines] = useState<FieldLine[]>(() => initialOrder?.items.map((item) => ({ product_id: item.product_id, title: item.product_title, part_number: item.part_number, price_cents: item.unit_price_cents, on_hand: item.on_hand, quantity: item.quantity, thumbnail_url: item.thumbnail_url })) ?? []);
  const [notes, setNotes] = useState(initialOrder?.notes ?? "");
  const [savedSnapshot, setSavedSnapshot] = useState<string>(() => fieldSnapshot(initialOrder?.items.map((item) => ({ product_id: item.product_id, title: item.product_title, part_number: item.part_number, price_cents: item.unit_price_cents, on_hand: item.on_hand, quantity: item.quantity, thumbnail_url: item.thumbnail_url })) ?? [], initialOrder?.notes ?? ""));
  const [productSearch, setProductSearch] = useState("");
  const productDeferred = useDeferredValue(productSearch);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [confirmingFinalize, setConfirmingFinalize] = useState(false);
  const confirmRef = useRef<HTMLElement | null>(null);
  useEffect(() => { if (confirmingFinalize) confirmRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }, [confirmingFinalize]);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [finalizedInfo, setFinalizedInfo] = useState<{ invoice_number: number | null; total_cents: number; account_balance_cents: number } | null>(null);
  const readOnly = finalizedInfo !== null || initialOrder?.status === "finalized";
  const dirty = fieldSnapshot(lines, notes) !== savedSnapshot;
  const subtotal = lines.reduce((sum, line) => sum + line.price_cents * line.quantity, 0);
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);
  const estimatedTax = customer && customer.tax_status !== "exempt" ? Math.round(subtotal * customer.tax_rate_bps / 10000) : 0;
  const estimatedTotal = subtotal + estimatedTax;

  const existingCustomerId = initialOrder?.customer_id ?? null;
  const accountQuery = useQuery({ queryKey: ["field-order-account", existingCustomerId], queryFn: () => api.getCustomerAccount({ id: existingCustomerId ?? 0 }), enabled: existingCustomerId !== null });
  useEffect(() => { if (accountQuery.data?.customer && !customer) setCustomer(accountQuery.data.customer); }, [accountQuery.data, customer]);
  const customers = useQuery({ queryKey: ["field-customers", customerDeferred], queryFn: () => api.listCustomers({ query: customerDeferred, limit: 20 }), enabled: !customer && !initialOrder });
  const products = useQuery({ queryKey: ["field-products", productDeferred], queryFn: () => api.listProducts({ query: productDeferred, mode: "all", limit: 20, offset: 0 }), enabled: productDeferred.trim().length > 0 && !readOnly });

  const addProduct = (product: Product) => {
    setLines((current) => {
      const existing = current.find((line) => line.product_id === product.id);
      if (existing) return current.map((line) => line.product_id === product.id ? { ...line, quantity: line.quantity + 1 } : line);
      return [...current, { product_id: product.id, title: product.title, part_number: product.part_number, price_cents: product.price_cents, on_hand: product.quantity, quantity: 1, thumbnail_url: product.thumbnail_url }];
    });
    setProductSearch("");
    setMessage(`${product.title} added.`);
  };
  const scan = async (barcode: string) => { const result = await api.findByBarcode({ barcode }); if (!result.product) return false; addProduct(result.product); setScannerOpen(false); return true; };

  const save = useMutation({
    mutationFn: () => currentId
      ? api.updateFieldOrder({ id: currentId, notes, items: lines.map((line) => ({ product_id: line.product_id, quantity: line.quantity })) })
      : api.createFieldOrder({ customer_id: customer?.id ?? 0, created_by: createdBy, notes, items: lines.map((line) => ({ product_id: line.product_id, quantity: line.quantity })) }),
    onSuccess: async (result) => {
      if (!result.ok || !result.order) { setError(result.error ?? "Could not save the draft."); return; }
      setCurrentId(result.order.id);
      setSavedSnapshot(fieldSnapshot(lines, notes));
      setError("");
      setMessage("Draft saved — it now shows at the store for Nathan to finalize.");
      await queryClient.invalidateQueries({ queryKey: ["field-orders"] });
    },
    onError: () => setError("Could not save the draft. Check your connection and try again."),
  });

  const finalize = useMutation({
    mutationFn: () => api.finalizeFieldOrder({ id: currentId ?? "" }),
    onSuccess: async (result) => {
      if (!result.ok) { setError(result.error ?? "Could not finalize this order."); setConfirmingFinalize(false); return; }
      setFinalizedInfo({ invoice_number: result.invoice_number, total_cents: result.total_cents, account_balance_cents: result.account_balance_cents });
      setConfirmingFinalize(false);
      setError("");
      setMessage("");
      await queryClient.invalidateQueries();
    },
    onError: () => { setError("Could not finalize this order. Try again."); setConfirmingFinalize(false); },
  });

  const cancel = useMutation({
    mutationFn: () => api.cancelFieldOrder({ id: currentId ?? "" }),
    onSuccess: async (result) => {
      if (!result.ok) { setError(result.error ?? "Could not cancel this draft."); return; }
      await queryClient.invalidateQueries({ queryKey: ["field-orders"] });
      onClose();
    },
    onError: () => setError("Could not cancel this draft. Try again."),
  });

  const customerLabel = customer ? (customer.business_name || customer.name) : (initialOrder ? (initialOrder.customer_business_name || initialOrder.customer_name) : "");
  const customerAddress = customer ? [customer.delivery_street, customer.delivery_city, customer.delivery_state, customer.delivery_zip].filter(Boolean).join(", ") : (initialOrder?.delivery_address ?? "");
  const customerPhone = customer?.phone ?? initialOrder?.customer_phone ?? "";
  const slipInvoiceNumber = finalizedInfo?.invoice_number ?? initialOrder?.invoice_number ?? null;
  const slipDateIso = initialOrder?.created_at ?? new Date().toISOString();
  const slipContactName = customer ? (customer.business_name ? customer.name : "") : (initialOrder?.customer_business_name ? initialOrder.customer_name : "");
  const slipAddressLines: string[] = customer
    ? [customer.delivery_street.trim(), [customer.delivery_city.trim(), customer.delivery_state.trim()].filter(Boolean).join(", ") + (customer.delivery_zip.trim() ? ` ${customer.delivery_zip.trim()}` : "")].filter((line) => line.trim().length > 0)
    : (initialOrder?.delivery_address ? [initialOrder.delivery_address] : []);
  const slipData: PackingSlipData = {
    invoiceNumber: slipInvoiceNumber,
    dateLabel: when(slipDateIso),
    dateShort: shortDate(slipDateIso),
    customerDisplay: customerLabel || "Customer",
    contactName: slipContactName,
    addressLines: slipAddressLines,
    phone: customerPhone,
    createdBy,
    statusLabel: readOnly ? "Finalized" : "Draft",
    notes,
    totalItems: itemCount,
    items: lines.map((line) => ({ title: line.title, partNumber: line.part_number, quantity: line.quantity, thumbnailUrl: line.thumbnail_url })),
  };
  const slipBody = packingSlipText({
    customerLabel: customerLabel || "Customer",
    contactName: slipContactName,
    address: customerAddress,
    phone: customerPhone,
    invoiceNumber: slipInvoiceNumber,
    createdBy,
    dateIso: slipDateIso,
    notes,
    lines: lines.map((line) => ({ quantity: line.quantity, title: line.title, partNumber: line.part_number })),
  });
  const [slipNote, setSlipNote] = useState("");
  const printSlip = () => {
    setSlipNote("Preparing print preview…");
    void buildPackingSlipPdfBlob(slipData)
      .then((blob) => { openPdfInTab(blob); setSlipNote(""); })
      .catch(() => {
        printDocument(`RIMA Packing Slip — ${customerLabel}`, slipBody, <PackingSlipDocument data={slipData} />);
        setSlipNote("");
      });
  };
  const saveSlip = () => {
    setSlipNote("Preparing your packing slip PDF…");
    void downloadPackingSlipPdf(`RIMA-packing-slip-${slipInvoiceNumber ?? currentId ?? "draft"}.pdf`, slipData)
      .then(() => setSlipNote("Packing slip PDF downloaded — open it from Downloads to print or share."))
      .catch(() => setSlipNote("Could not build the PDF — try Print instead."));
  };
  const canSave = !readOnly && !!customer && lines.length > 0 && dirty;
  const canFinalize = !readOnly && currentId !== null && !dirty && lines.length > 0;

  return <div className="field-editor">
    <button type="button" className="back-button" onClick={onClose}><BackIcon /> All field orders</button>
    <section className="checkout-head field-head">
      <div><p>{readOnly ? "FIELD ORDER · FINALIZED" : currentId ? "FIELD ORDER · DRAFT" : "NEW FIELD ORDER"}</p><h1>{customerLabel || "Take an order"}</h1></div>
      {lines.length ? <strong>{money(subtotal)}</strong> : null}
    </section>

    {finalizedInfo ? <div className="field-success" role="status"><strong>Posted to the customer&apos;s account{finalizedInfo.invoice_number !== null ? ` as Invoice #${finalizedInfo.invoice_number}` : ""}.</strong><span>{money(finalizedInfo.total_cents)} charged to the account{finalizedInfo.account_balance_cents > 0 ? ` · account balance is now ${money(finalizedInfo.account_balance_cents)}` : ""}. Print the packing slip so the order can be pulled.</span><div className="delivery-actions"><button type="button" className="print-action" onClick={printSlip} aria-label="Print packing slip"><PrinterIcon /> Print packing slip</button><button type="button" onClick={saveSlip} aria-label="Download packing slip"><DownloadIcon /> Save slip</button></div>{slipNote ? <p className="delivery-note" role="status">{slipNote}</p> : null}<PackingSlipDocument data={slipData} /></div> : initialOrder?.status === "finalized" ? <div className="field-success" role="status"><strong>Already posted{initialOrder.invoice_number !== null ? ` as Invoice #${initialOrder.invoice_number}` : ""}.</strong><span>This field order is on the customer&apos;s account. Reprint the packing slip any time.</span></div> : null}
    {initialOrder && initialOrder.returns.length > 0 ? <section className="field-returns-panel" aria-label="Returns on this field order"><div className="mini-heading"><h3>Returns on this field order</h3><span>{initialOrder.returns.length}</span></div><p className="field-note">These items came back on Invoice #{initialOrder.invoice_number ?? "—"} from this field order. They were restocked and the customer was refunded / credited as shown.</p>{initialOrder.returns.map((ret) => <article key={ret.id} className="return-record"><div className="return-record-head"><span><ReturnIcon /><strong>{refundMethodLabel(ret.refund_method)}</strong></span><span>{when(ret.created_at)}</span><b>-{money(ret.total_cents)}</b></div><ul>{ret.items.map((item) => <li key={item.id}><span>{item.quantity} × {item.product_title} — <em>{item.reason}</em></span><b>{money(item.line_total_cents)}</b></li>)}</ul><small>{[ret.refunded_cents > 0 ? `${money(ret.refunded_cents)} handed back` : "", ret.credited_cents > 0 ? `${money(ret.credited_cents)} taken off the balance` : ""].filter(Boolean).join(" · ")}</small></article>)}</section> : null}

    {!customer ? <section className="checkout-step field-step">
      <div className="step-title"><span>1</span><div><h2>Pick the customer</h2><p>Search by business, name, or phone. Big list, quick tap — built for standing in a stock room.</p></div></div>
      <SearchField value={customerSearch} onChange={setCustomerSearch} placeholder="Search customers" label="Search customers for field order" />
      <div className="picker-results field-customer-list">
        {(customers.data?.customers ?? []).map((item) => <button key={item.id} onClick={() => { setCustomer(item); setCustomerSearch(""); }}><span><strong>{item.business_name || item.name}</strong><small>{item.business_name ? `${item.name} · ` : ""}{item.phone || item.email || "No contact details"}{item.delivery_city ? ` · ${item.delivery_city}` : ""}</small></span>{item.balance_cents > 0 ? <b>{money(item.balance_cents)} due</b> : <b className="paid-mark">No balance</b>}</button>)}
        {customers.isPending ? <p className="quiet-empty field-list-note">Loading customers…</p> : null}
        {!customers.isPending && (customers.data?.customers.length ?? 0) === 0 ? <p className="quiet-empty field-list-note">No customers match. Try a shorter search, or add the customer in the Customers tab first.</p> : null}
      </div>
    </section> : <>
      <section className="checkout-step field-step">
        <div className="selected-customer">
          <UserIcon />
          <span><strong>{customer.business_name || customer.name}</strong><small>{customerAddress || "No delivery address on file"} · Open balance {money(customer.balance_cents)}</small></span>
          {!currentId && !readOnly ? <button onClick={() => setCustomer(null)}>Change</button> : null}
        </div>
        {!readOnly ? <fieldset className="salesperson-options field-salesperson"><legend>Order taken by</legend>{fieldPeople.map((person) => <label key={person} className={createdBy === person ? "active" : ""}><input type="radio" name="field-created-by" value={person} checked={createdBy === person} onChange={() => setCreatedBy(person)} />{person}</label>)}</fieldset> : null}
      </section>

      <section className="checkout-step field-step">
        <div className="step-title"><span>2</span><div><h2>{readOnly ? "Items on this order" : "Add what they need"}</h2><p>{readOnly ? "This order is posted — quantities are locked." : "Search or scan each item. Tap a result to add it; use the steppers for cases and multiples."}</p></div></div>
        {!readOnly ? <><div className="search-row"><SearchField value={productSearch} onChange={setProductSearch} placeholder="Search products or part #" label="Search products for field order" /><button className="scan-button field-scan" onClick={() => setScannerOpen(true)} aria-label="Scan a barcode to add a product"><ScanIcon /><span>Scan</span></button></div>
        {productSearch ? <div className="picker-results product-picker">{products.data?.products.map((product) => <button key={product.id} onClick={() => addProduct(product)}><span><strong>{product.title}</strong><small>{product.vendor}{product.part_number ? ` · Part # ${product.part_number}` : ""} · {product.quantity} on hand</small></span><b>{money(product.price_cents)}</b></button>)}{products.data && products.data.products.length === 0 ? <p className="quiet-empty field-list-note">No products match that search.</p> : null}</div> : null}</> : null}
        <div className="cart-lines field-lines">
          {lines.length === 0 ? <div className="cart-empty"><CartIcon /><p>Nothing added yet — search or scan the first item.</p></div> : lines.map((line) => <article key={line.product_id}>
            <span><strong>{line.title}</strong><small>{money(line.price_cents)} each · {line.on_hand} on hand{line.quantity > line.on_hand ? ` · only ${line.on_hand} in stock` : ""}</small></span>
            {readOnly ? <b className="field-line-qty">× {line.quantity}</b> : <div className="cart-qty field-qty"><button onClick={() => setLines((current) => current.flatMap((item) => item.product_id === line.product_id ? item.quantity === 1 ? [] : [{ ...item, quantity: item.quantity - 1 }] : [item]))} aria-label={`Decrease ${line.title}`}><MinusIcon /></button><b>{line.quantity}</b><button onClick={() => setLines((current) => current.map((item) => item.product_id === line.product_id ? { ...item, quantity: Math.min(9999, item.quantity + 1) } : item))} aria-label={`Increase ${line.title}`}><PlusIcon /></button></div>}
            <strong>{money(line.price_cents * line.quantity)}</strong>
          </article>)}
        </div>
        <label className="notes-field field-notes"><span>Notes for the store (optional)</span><textarea aria-label="Notes for the store" value={notes} disabled={readOnly} onChange={(event) => setNotes(event.target.value)} rows={2} placeholder="e.g. Deliver Thursday, ask for Mike at the counter" /></label>
        {!readOnly ? <VoiceNotes disabled={readOnly} onAddToNotes={(text) => setNotes((prev) => prev ? `${prev}\n\n${text}` : text)} /> : null}
      </section>

      {lines.length > 0 && !finalizedInfo ? <section className="checkout-step field-step slip-preview" aria-label="Packing slip preview">
        <div className="step-title"><span>3</span><div><h2>Packing slip</h2><p>The slip the store pulls from — customer and delivery address up top, then every product with its picture and quantity. It updates as you change the order.</p></div></div>
        <PackingSlipDocument data={slipData} />
        {slipNote ? <p className="delivery-note" role="status">{slipNote}</p> : null}
      </section> : null}

      {error ? <p className="form-error field-error" role="alert">{error}</p> : null}
      {message ? <div className="checkout-message" role="status">{message}</div> : null}

      {confirmingFinalize ? <section ref={confirmRef} className="field-confirm" role="alertdialog" aria-label="Confirm finalize field order">
        <h2>Finalize this order?</h2>
        <p>This posts <strong>{money(estimatedTotal)}</strong> ({money(subtotal)} + {money(estimatedTax)} tax) to {customerLabel}&apos;s account as a new invoice, takes the items out of stock, and readies the packing slip. This can&apos;t be undone from here.</p>
        <div className="form-actions"><button type="button" className="secondary-button" onClick={() => setConfirmingFinalize(false)}>Not yet</button><button type="button" className="primary-button" disabled={finalize.isPending} onClick={() => finalize.mutate()}>{finalize.isPending ? "Posting…" : `Finalize · Post ${money(estimatedTotal)}`}</button></div>
      </section> : null}

      <div className="field-actionbar">
        <div className="field-actionbar-total"><span>{itemCount} item{itemCount === 1 ? "" : "s"}</span><strong>{money(subtotal)}</strong></div>
        {readOnly ? <button type="button" className="primary-button" onClick={printSlip}>Print packing slip</button>
        : <>
          <button type="button" className="secondary-button" disabled={!canSave || save.isPending} onClick={() => { setError(""); save.mutate(); }}>{save.isPending ? "Saving…" : currentId ? (dirty ? "Save changes" : "Saved") : "Save draft"}</button>
          <button type="button" className="primary-button" disabled={!canFinalize} onClick={() => { setError(""); setConfirmingFinalize(true); }}>Finalize</button>
        </>}
      </div>
      {!readOnly && currentId && dirty ? <p className="field-note">You have unsaved changes — save the draft before finalizing so the store sees the latest list.</p> : null}
      {!readOnly && currentId ? <div className="field-draft-tools">
        <button type="button" className="secondary-button" onClick={printSlip}><PrinterIcon /> Print draft slip</button>
        {confirmingCancel ? <span className="field-cancel-confirm">Cancel this draft? <button type="button" className="link-button danger-link" disabled={cancel.isPending} onClick={() => cancel.mutate()}>Yes, cancel it</button> <button type="button" className="link-button" onClick={() => setConfirmingCancel(false)}>Keep it</button></span> : <button type="button" className="link-button danger-link" onClick={() => setConfirmingCancel(true)}>Cancel draft</button>}
      </div> : null}
    </>}
    {scannerOpen ? <Scanner onClose={() => setScannerOpen(false)} onFound={scan} /> : null}
  </div>;
}

function FieldOrdersView() {
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const orders = useQuery({ queryKey: ["field-orders"], queryFn: () => api.listFieldOrders({ status: "all", limit: 50 }) });
  const all = orders.data?.orders ?? [];
  const drafts = all.filter((order) => order.status === "draft");
  const finalized = all.filter((order) => order.status === "finalized");
  if (editingId !== null) {
    return <FieldOrderEditor orderId={editingId === "new" ? null : editingId} initialOrder={editingId === "new" ? null : all.find((order) => order.id === editingId) ?? null} onClose={() => setEditingId(null)} />;
  }
  return <>
    <section className="plain-command"><div><p>FIELD ORDERS</p><h1>Field orders</h1></div><button className="primary-button field-new-button" onClick={() => setEditingId("new")}><PlusIcon /> New order</button></section>
    <p className="field-intro">Taken in a customer&apos;s stock room, saved as a draft. Drafts show up here at the store — finalize one to post it to the customer&apos;s account and print the packing slip.</p>
    <section className="inventory-section">
      <div className="section-heading"><div><p>WAITING AT THE STORE</p><h1>Drafts to finalize</h1></div><span>{drafts.length} draft{drafts.length === 1 ? "" : "s"}</span></div>
      {orders.isPending ? <div className="loading-list"><span /><span /></div> : null}
      {!orders.isPending && drafts.length === 0 ? <div className="empty-state"><h2>No drafts waiting</h2><p>Start a new field order and it will land here for Nathan to finalize.</p><button className="primary-button" onClick={() => setEditingId("new")}>Start a field order</button></div> : <div className="field-order-list">{drafts.map((order) => <button key={order.id} className="field-order-card" onClick={() => setEditingId(order.id)}>
        <span className="field-order-main"><strong>{order.customer_business_name || order.customer_name}</strong><small>{order.item_count} item{order.item_count === 1 ? "" : "s"} · taken by {order.created_by} · {when(order.updated_at)}</small>{order.notes ? <small className="field-order-notes">{order.notes}</small> : null}</span>
        <span className="field-order-side"><b>{money(order.subtotal_cents)}</b><small>Draft</small></span><ChevronIcon />
      </button>)}</div>}
    </section>
    {finalized.length ? <section className="inventory-section">
      <div className="section-heading"><div><p>POSTED</p><h1>Recently finalized</h1></div><span>{finalized.length}</span></div>
      <div className="field-order-list">{finalized.map((order) => <button key={order.id} className="field-order-card finalized" onClick={() => setEditingId(order.id)}>
        <span className="field-order-main"><strong>{order.customer_business_name || order.customer_name}</strong><small>{order.invoice_number !== null ? `Invoice #${order.invoice_number} · ` : ""}{order.item_count} item{order.item_count === 1 ? "" : "s"} · {order.finalized_at ? when(order.finalized_at) : ""}</small>{order.returned_cents > 0 ? <small className="field-return-badge">{order.returned_units} returned · -{money(order.returned_cents)} — see Returns on this order</small> : null}</span>
        <span className="field-order-side"><b>{money(order.subtotal_cents)}</b><small>{order.returned_cents > 0 ? "Has returns" : "On account"}</small></span><ChevronIcon />
      </button>)}</div>
    </section> : null}
  </>;
}

function CheckoutView({ onOpenCustomer }: { onOpenCustomer: (id: number) => void }) {
  const queryClient = useQueryClient();
  const [customerSearch, setCustomerSearch] = useState("");
  const customerDeferred = useDeferredValue(customerSearch);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const productDeferred = useDeferredValue(productSearch);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [method, setMethod] = useState<"cash" | "card" | "check">("cash");
  const [salesperson, setSalesperson] = useState<string>("Randy");
  const teamQuery = useQuery({ queryKey: ["sales-team"], queryFn: () => api.listSalesTeam({}) });
  const teamNames = (teamQuery.data?.members.filter((m) => m.active).map((m) => m.name) ?? []);
  const checkoutPeople = teamNames.length ? teamNames : ["Randy", "Nathan", "Alan"];
  type BalanceChoice = "pay_all" | "pay_today" | "charge_account" | "pay_today_plus_balance" | "partial";
  const [balanceChoice, setBalanceChoice] = useState<BalanceChoice>("pay_today");
  const [partial, setPartial] = useState("");
  const [balanceExtra, setBalanceExtra] = useState("");
  const [message, setMessage] = useState("");
  const [completedInvoice, setCompletedInvoice] = useState<AccountOrder | null>(null);
  const [completedCustomer, setCompletedCustomer] = useState<Customer | null>(null);
  const customers = useQuery({ queryKey: ["checkout-customers", customerDeferred], queryFn: () => api.listCustomers({ query: customerDeferred, limit: 8 }) });
  const products = useQuery({ queryKey: ["checkout-products", productDeferred], queryFn: () => api.listProducts({ query: productDeferred, mode: "all", limit: 20, offset: 0 }), enabled: productDeferred.trim().length > 0 });
  const subtotal = cart.reduce((sum, line) => sum + line.product.price_cents * line.quantity, 0);
  const isWalkIn = !customer;
  const taxRateBps = isWalkIn ? 700 : customer.tax_status === "taxable" ? customer.tax_rate_bps : 0;
  const tax = Math.round(subtotal * taxRateBps / 10000);
  const total = subtotal + tax;
  const oldBalance = customer?.balance_cents ?? 0;
  const hasBalance = !!customer && oldBalance > 0;
  const extraValue = Number(balanceExtra);
  const extraCents = Number.isFinite(extraValue) ? Math.round(extraValue * 100) : 0;
  const partialValue = Number(partial);
  const partialCents = Number.isFinite(partialValue) ? Math.round(partialValue * 100) : 0;
  let paymentCents = total;
  let balancePaymentCents = 0;
  if (isWalkIn) { paymentCents = total; balancePaymentCents = 0; }
  else if (hasBalance) {
    if (balanceChoice === "pay_all") { paymentCents = total; balancePaymentCents = oldBalance; }
    else if (balanceChoice === "pay_today") { paymentCents = total; balancePaymentCents = 0; }
    else if (balanceChoice === "charge_account") { paymentCents = 0; balancePaymentCents = 0; }
    else if (balanceChoice === "pay_today_plus_balance") { paymentCents = total; balancePaymentCents = Math.max(0, Math.min(oldBalance, extraCents)); }
    else { paymentCents = total; balancePaymentCents = 0; }
  } else if (customer) {
    if (balanceChoice === "charge_account") { paymentCents = 0; }
    else if (balanceChoice === "partial") { paymentCents = Math.max(0, Math.min(total, partialCents)); }
    else { paymentCents = total; }
  }
  const collectedCents = paymentCents + balancePaymentCents;
  const extraValid = balanceChoice !== "pay_today_plus_balance" || (Number.isFinite(extraValue) && extraCents > 0 && extraCents <= oldBalance);
  const partialValid = balanceChoice !== "partial" || (partial !== "" && Number.isFinite(partialValue) && partialCents >= 0 && partialCents <= total);
  const canComplete = cart.length > 0 && extraValid && partialValid;
  const addProduct = (product: Product) => { setCart((lines) => { const existing = lines.find((line) => line.product.id === product.id); if (existing) return lines.map((line) => line.product.id === product.id ? { ...line, quantity: Math.min(product.quantity, line.quantity + 1) } : line); return product.quantity > 0 ? [...lines, { product, quantity: 1 }] : lines; }); setProductSearch(""); };
  const scan = async (barcode: string) => { const result = await api.findByBarcode({ barcode }); if (!result.product) return false; if (result.product.quantity <= 0) { setMessage(`${result.product.title} is out of stock.`); setScannerOpen(false); return true; } addProduct(result.product); setScannerOpen(false); return true; };
  const addPreferenceProduct = async (productId: number) => { const result = await api.getProduct({ id: productId }); if (!result.product) { setMessage("That usual item could not be found in the catalog."); return; } if (result.product.quantity <= 0) { setMessage(`${result.product.title} is out of stock right now.`); return; } addProduct(result.product); setMessage(`${result.product.title} added from ${customer?.business_name || customer?.name || "the customer"}'s usual items.`); };
  const complete = useMutation({ mutationFn: () => api.completeSale({ customer_id: customer?.id ?? null, items: cart.map((line) => ({ product_id: line.product.id, quantity: line.quantity })), payment_method: method, payment_cents: paymentCents, balance_payment_cents: balancePaymentCents, salesperson }), onSuccess: async (result) => { if (!result.ok) { setMessage(result.error ?? "Could not complete sale."); return; } const savedCustomer = customer ? { ...customer, balance_cents: result.account_balance_cents } : null; setCompletedInvoice({ id: result.sale_id ?? crypto.randomUUID(), invoice_number: result.invoice_number, customer_id: customer?.id ?? null, customer_name: customer?.name ?? "Walk-in", salesperson: result.salesperson ?? salesperson, subtotal_cents: result.subtotal_cents, tax_cents: result.tax_cents, tax_rate_bps: result.tax_rate_bps, tax_status: customer?.tax_status ?? "taxable", total_cents: result.total_cents, paid_cents: result.paid_cents, balance_cents: result.total_cents - result.paid_cents, status: result.paid_cents === result.total_cents ? "paid" : result.paid_cents === 0 ? "unpaid" : "partial", created_at: new Date().toISOString(), items: cart.map((line, index) => ({ id: index + 1, product_id: line.product.id, product_title: line.product.title, quantity: line.quantity, returned_quantity: 0, unit_price_cents: line.product.price_cents, line_total_cents: line.product.price_cents * line.quantity })), returns: [] }); setCompletedCustomer(savedCustomer); const parts = [`Invoice #${result.invoice_number ?? "—"} complete`, `Sold by ${result.salesperson ?? salesperson}`]; if (result.collected_cents > 0) parts.push(`${money(result.collected_cents)} collected`); if (result.balance_paid_cents > 0) parts.push(`${money(result.balance_paid_cents)} applied to old balance`); if (result.account_balance_cents > 0) parts.push(`${money(result.account_balance_cents)} still on account`); setMessage(parts.join(" · ")); setCustomer(savedCustomer); setCart([]); setPartial(""); setBalanceExtra(""); setBalanceChoice("pay_today"); await queryClient.invalidateQueries(); }, onError: () => setMessage("Could not complete sale. Try again.") });
  const taxLabel = isWalkIn ? "(7.00% RI)" : customer?.tax_status === "exempt" ? "(exempt)" : customer?.tax_rate_source === "override" ? `(${percent(taxRateBps)} manual)` : customer?.tax_rate_source === "state" ? `(${percent(taxRateBps)} state)` : customer ? "(state not configured)" : "(7.00% RI)";
  return <><section className="checkout-head"><div><p>NEW SALE</p><h1>Checkout</h1></div><strong>{money(collectedCents || total)}</strong></section><div className="checkout-layout"><section className="checkout-work"><div className="checkout-step"><div className="step-title"><span>1</span><div><h2>Customer</h2><p>Choose an account or use walk-in. Walk-ins are charged 7% RI sales tax.</p></div></div><div className="customer-choice">{customer ? <div className="selected-customer"><UserIcon /><span><strong>{customer.business_name || customer.name}</strong><small>{taxDescription(customer)} · Open balance {money(customer.balance_cents)}{customer.open_wishlist_count > 0 ? ` · ${customer.open_wishlist_count} open on wishlist — open the account to see them` : ""}</small></span><button onClick={() => { setCustomer(null); setBalanceChoice("pay_today"); }}>Change</button></div> : <><button className="walkin-choice" onClick={() => { setCustomer(null); setCustomerSearch(""); }}><UserIcon /><span><strong>Walk-in</strong><small>No account · 7% RI sales tax · paid in full</small></span></button><SearchField value={customerSearch} onChange={setCustomerSearch} placeholder="Find an existing customer" label="Find customer for sale" />{customerSearch ? <div className="picker-results">{customers.data?.customers.map((item) => <button key={item.id} onClick={() => { setCustomer(item); setCustomerSearch(""); setBalanceChoice("pay_today"); }}><span>{item.business_name || item.name}<small>{item.business_name ? `${item.name} · ${item.phone || item.email}` : item.phone || item.email}</small></span><b>{money(item.balance_cents)} due</b></button>)}</div> : null}</>}</div></div>{customer ? <BuyingPreferencesSection customerId={customer.id} variant="checkout" onAddToCart={(productId) => { void addPreferenceProduct(productId); }} /> : null}<div className="checkout-step"><div className="step-title"><span>2</span><div><h2>Products</h2><p>Search or scan, then set quantities.</p></div></div><div className="search-row"><SearchField value={productSearch} onChange={setProductSearch} placeholder="Search products" label="Search products for sale" /><button className="scan-button" onClick={() => setScannerOpen(true)}><ScanIcon /><span>Scan</span></button></div>{productSearch ? <div className="picker-results product-picker">{products.data?.products.map((product) => <button key={product.id} disabled={product.quantity === 0} onClick={() => addProduct(product)}><span><strong>{product.title}</strong><small>{product.vendor} · {product.quantity} on hand</small></span><b>{money(product.price_cents)}</b></button>)}</div> : null}<div className="cart-lines">{cart.length === 0 ? <div className="cart-empty"><CartIcon /><p>No products added yet.</p></div> : cart.map((line) => <article key={line.product.id}><span><strong>{line.product.title}</strong><small>{money(line.product.price_cents)} each · {line.product.quantity} in stock</small></span><div className="cart-qty"><button onClick={() => setCart((lines) => lines.flatMap((item) => item.product.id === line.product.id ? item.quantity === 1 ? [] : [{ ...item, quantity: item.quantity - 1 }] : [item]))} aria-label={`Decrease ${line.product.title}`}><MinusIcon /></button><b>{line.quantity}</b><button disabled={line.quantity >= line.product.quantity} onClick={() => setCart((lines) => lines.map((item) => item.product.id === line.product.id ? { ...item, quantity: item.quantity + 1 } : item))} aria-label={`Increase ${line.product.title}`}><PlusIcon /></button></div><strong>{money(line.product.price_cents * line.quantity)}</strong></article>)}</div></div></section><aside className="payment-panel"><div className="step-title"><span>3</span><div><h2>Payment</h2><p>Pick the salesperson, then how this sale settles.</p></div></div><fieldset className="salesperson-options"><legend>Salesperson</legend>{checkoutPeople.map((person) => <label key={person} className={salesperson === person ? "active" : ""}><input type="radio" name="salesperson" value={person} checked={salesperson === person} onChange={() => setSalesperson(person)} />{person}</label>)}</fieldset>{customer ? <button className="account-callout" onClick={() => onOpenCustomer(customer.id)}><span>Current account balance</span><strong>{money(customer.balance_cents)}</strong></button> : <div className="walkin-note">Walk-in sale · 7% RI sales tax · full payment required</div>}<div className="sale-breakdown"><div><span>Subtotal</span><b>{money(subtotal)}</b></div><div><span>Tax {taxLabel}</span><b>{money(tax)}</b></div>{hasBalance ? <div><span>Outstanding balance</span><b>{money(oldBalance)}</b></div> : null}</div><div className="total-line"><span>Today&apos;s total</span><strong>{money(total)}</strong></div>{hasBalance ? <fieldset className="pay-options balance-options"><legend>Customer owes {money(oldBalance)} — what happens at checkout?</legend><label><input type="radio" name="balance-choice" checked={balanceChoice === "pay_all"} onChange={() => setBalanceChoice("pay_all")} /><span><strong>Pay balance + today together</strong><small>Collect {money(oldBalance + total)} in one payment — {money(oldBalance)} old + {money(total)} today. Clears the account.</small></span></label><label><input type="radio" name="balance-choice" checked={balanceChoice === "pay_today"} onChange={() => setBalanceChoice("pay_today")} /><span><strong>Pay just today&apos;s invoice</strong><small>Collect {money(total)}. Leave the {money(oldBalance)} balance alone.</small></span></label><label><input type="radio" name="balance-choice" checked={balanceChoice === "charge_account"} onChange={() => setBalanceChoice("charge_account")} /><span><strong>Charge today to the account</strong><small>Collect $0 now. New balance becomes {money(oldBalance + total)}.</small></span></label><label><input type="radio" name="balance-choice" checked={balanceChoice === "pay_today_plus_balance"} onChange={() => setBalanceChoice("pay_today_plus_balance")} /><span><strong>Pay today + a payment on the old balance</strong><small>Cash out today&apos;s sale and put extra toward what they already owe.</small></span></label>{balanceChoice === "pay_today_plus_balance" ? <label className="amount-field"><span>Extra toward old balance (up to {money(oldBalance)})</span><div><b>$</b><input aria-label="Payment toward old balance" type="number" inputMode="decimal" min="0.01" max={oldBalance / 100} step="0.01" value={balanceExtra} onChange={(event) => setBalanceExtra(event.target.value)} placeholder="0.00" /></div></label> : null}{balanceChoice === "pay_today_plus_balance" && !extraValid && balanceExtra !== "" ? <p className="form-error">Enter an amount between $0.01 and {money(oldBalance)}.</p> : null}</fieldset> : customer ? <fieldset className="pay-options"><legend>Amount for today</legend><label><input type="radio" name="balance-choice" checked={balanceChoice === "pay_today"} onChange={() => setBalanceChoice("pay_today")} /> Full payment — {money(total)}</label><label><input type="radio" name="balance-choice" checked={balanceChoice === "partial"} onChange={() => setBalanceChoice("partial")} /> Partial payment</label><label><input type="radio" name="balance-choice" checked={balanceChoice === "charge_account"} onChange={() => setBalanceChoice("charge_account")} /> Charge to account — collect $0 now</label>{balanceChoice === "partial" ? <label className="amount-field"><span>Amount received</span><div><b>$</b><input aria-label="Partial payment amount" type="number" inputMode="decimal" min="0" max={total / 100} step="0.01" value={partial} onChange={(event) => setPartial(event.target.value)} placeholder="0.00" /></div></label> : null}{balanceChoice === "partial" && !partialValid && partial !== "" ? <p className="form-error">Enter a valid payment amount.</p> : null}</fieldset> : null}{(isWalkIn || collectedCents > 0) ? <fieldset className="method-options"><legend>Method</legend>{(["cash", "card", "check"] as const).map((value) => <label key={value} className={method === value ? "active" : ""}><input type="radio" name="method" value={value} checked={method === value} onChange={() => setMethod(value)} />{value}</label>)}</fieldset> : <div className="walkin-note">No payment collected — this sale goes on the account.</div>}{hasBalance && balanceChoice === "pay_all" ? <div className="collect-line"><span>Collect in one payment</span><strong>{money(collectedCents)}</strong></div> : hasBalance && balanceChoice === "pay_today_plus_balance" && extraValid && extraCents > 0 ? <div className="collect-line"><span>Collect ({money(total)} today + {money(extraCents)} on balance)</span><strong>{money(collectedCents)}</strong></div> : customer && balanceChoice === "charge_account" ? <div className="remainder"><span>Added to {customer.name}&apos;s account</span><strong>{money(total)}</strong></div> : customer && paymentCents < total ? <div className="remainder"><span>Added to {customer.name}&apos;s account</span><strong>{money(Math.max(0, total - paymentCents))}</strong></div> : null}{message ? <div className="checkout-message" role="status">{message}</div> : null}{completedInvoice ? <div className="completed-delivery"><strong>Invoice #{completedInvoice.invoice_number ?? "—"} · Sold by {completedInvoice.salesperson} — print, send, or save</strong><InvoiceDocument order={completedInvoice} customer={completedCustomer} /><DeliveryActions subject={`RIMA Invoice #${completedInvoice.invoice_number ?? completedInvoice.id}`} body={invoiceText(completedInvoice, completedCustomer)} email={completedCustomer?.ap_email || completedCustomer?.email || ""} phone={completedCustomer?.ap_phone || completedCustomer?.phone || ""} filename={`RIMA-invoice-${completedInvoice.invoice_number ?? completedInvoice.id}.html`} label={`invoice ${completedInvoice.invoice_number ?? completedInvoice.id}`} invoice={{ order: completedInvoice, customer: completedCustomer }} /></div> : null}<button className="primary-button complete-button" disabled={complete.isPending || !canComplete} onClick={() => complete.mutate()}>{complete.isPending ? "Completing…" : collectedCents === 0 && customer ? `Complete sale · Charge ${money(total)} to account` : `Complete sale · Collect ${money(collectedCents)}`}</button></aside></div>{scannerOpen ? <Scanner onClose={() => setScannerOpen(false)} onFound={scan} /> : null}</>;
}


function SalesBySalesperson() {
  const [filter, setFilter] = useState<string | null>(null);
  const report = useQuery({ queryKey: ["sales-by-salesperson", filter], queryFn: () => api.getSalesBySalesperson({ salesperson: filter, limit: 50 }) });
  return <section className="settings-panel sales-report"><div className="settings-copy"><h2>Sales by salesperson</h2><p>Every checkout records who made the sale. Totals below cover all invoices; tap a name to see just that person&apos;s recent sales.</p></div><div className="salesperson-summary">{report.data?.summary.map((row) => <button key={row.salesperson} type="button" className={`salesperson-card ${filter === row.salesperson ? "active" : ""}`} onClick={() => setFilter((current) => current === row.salesperson ? null : row.salesperson)} aria-label={`Filter sales by ${row.salesperson}`}><strong>{row.salesperson}</strong><span>{row.sale_count} sale{row.sale_count === 1 ? "" : "s"}</span><b>{money(row.total_cents)}</b><small>{money(row.paid_cents)} collected · {money(row.balance_cents)} on account</small></button>) ?? <p className="quiet-empty">Loading sales…</p>}</div>{filter ? <p className="field-note">Showing recent sales by {filter}. <button type="button" className="link-button" onClick={() => setFilter(null)}>Show everyone</button></p> : null}<div className="sales-report-list">{report.isPending ? <p className="quiet-empty">Loading recent sales…</p> : report.data?.sales.length === 0 ? <p className="quiet-empty">No sales recorded yet{filter ? ` for ${filter}` : ""}.</p> : report.data?.sales.map((sale) => <article key={sale.id} className="sales-report-row"><div><strong>{sale.invoice_number !== null ? `Invoice #${sale.invoice_number}` : "Invoice"} · {sale.customer_name}</strong><span>{when(sale.created_at)} · Sold by {sale.salesperson} · {sale.status}</span></div><div className="sales-report-amounts"><b>{money(sale.total_cents)}</b><small>{money(sale.paid_cents)} paid{sale.balance_cents > 0 ? ` · ${money(sale.balance_cents)} due` : ""}</small></div><DeliveryActions subject={`RIMA Invoice #${sale.invoice_number ?? sale.id}`} body={invoiceText(sale, null)} email="" phone="" filename={`RIMA-invoice-${sale.invoice_number ?? sale.id}.html`} label={`invoice ${sale.invoice_number ?? sale.id}`} invoice={{ order: sale, customer: null }} /><ReturnsHistory order={sale} /><InvoiceReturnForm key={`${sale.id}:${sale.returns.map((ret) => ret.id).join(",")}`} order={sale} /></article>)}</div></section>;
}

type AnalyticsPreset = "month" | "lastMonth" | "last30" | "year" | "all" | "custom";
type ItemSort = "profit" | "units" | "revenue" | "margin" | "title";

function isoDate(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function presetRange(preset: Exclude<AnalyticsPreset, "custom">): { start: string; end: string } {
  const now = new Date();
  if (preset === "all") return { start: "", end: "" };
  if (preset === "month") return { start: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), end: isoDate(now) };
  if (preset === "lastMonth") return { start: isoDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)), end: isoDate(new Date(now.getFullYear(), now.getMonth(), 0)) };
  if (preset === "last30") { const from = new Date(now); from.setDate(from.getDate() - 29); return { start: isoDate(from), end: isoDate(now) }; }
  return { start: isoDate(new Date(now.getFullYear(), 0, 1)), end: isoDate(now) };
}
function prettyRange(start: string, end: string): string {
  if (!start && !end) return "All time";
  const fmt = (value: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T12:00:00`));
  return `${start ? fmt(start) : "Beginning"} – ${end ? fmt(end) : "Today"}`;
}

function AnalyticsView() {
  const [preset, setPreset] = useState<AnalyticsPreset>("month");
  const [range, setRange] = useState(() => presetRange("month"));
  const [personFilter, setPersonFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<ItemSort>("profit");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const startDate = range.start || null;
  const endDate = range.end || null;
  const people = useQuery({ queryKey: ["analytics-salespeople", startDate, endDate, personFilter], queryFn: () => api.getSalespersonReport({ start_date: startDate, end_date: endDate, salesperson: personFilter }) });
  const items = useQuery({ queryKey: ["analytics-items", startDate, endDate, sortBy, sortDir], queryFn: () => api.getItemAnalytics({ start_date: startDate, end_date: endDate, sort_by: sortBy, sort_dir: sortDir }) });
  const pickPreset = (value: AnalyticsPreset) => { setPreset(value); if (value !== "custom") setRange(presetRange(value)); };
  const setManual = (key: "start" | "end", value: string) => { setPreset("custom"); setRange((current) => ({ ...current, [key]: value })); };
  const totals = people.data?.totals;
  const printReport = () => {
    const lines = [
      `SALESPERSON SUMMARY — ${prettyRange(range.start, range.end)}`,
      "Commission uses each team member's stored rate (Sales Team page) on net sales before tax.",
      "",
      ...(people.data?.rows.map((row) => `${row.salesperson}: ${row.sale_count} sales · Net ${money(row.subtotal_cents)} · Tax ${money(row.tax_cents)} · Total ${money(row.total_cents)} · Collected ${money(row.paid_cents)} · On account ${money(row.balance_cents)} · Profit ${money(row.profit_cents)} · Commission ${(row.commission_bps/100).toFixed(2)}% due ${money(row.commission_cents)}`) ?? []),
      "",
      totals ? `TOTALS: ${totals.sale_count} sales · Net ${money(totals.subtotal_cents)} · Total ${money(totals.total_cents)} · Collected ${money(totals.paid_cents)} · On account ${money(totals.balance_cents)} · Profit ${money(totals.profit_cents)} · Commission due ${money(totals.commission_cents)}` : "",
    ];
    openPdfInTab(buildPdfBlob("RIMA salesperson summary", lines.join("\n")));
  };
  const toggleSort = (key: ItemSort) => { if (sortBy === key) setSortDir((dir) => dir === "desc" ? "asc" : "desc"); else { setSortBy(key); setSortDir(key === "title" ? "asc" : "desc"); } };
  const sortMark = (key: ItemSort) => sortBy === key ? (sortDir === "desc" ? " ↓" : " ↑") : "";
  return <>
    <section className="plain-command"><div><p>ANALYTICS</p><h1>Sales analytics</h1></div><span className="analytics-period">{prettyRange(range.start, range.end)}</span></section>
    <section className="analytics-filters" aria-label="Report date range">
      <div className="preset-chips" role="group" aria-label="Date range presets">
        {([["month", "This month"], ["lastMonth", "Last month"], ["last30", "Last 30 days"], ["year", "This year"], ["all", "All time"], ["custom", "Custom"]] as Array<[AnalyticsPreset, string]>).map(([value, label]) => <button key={value} type="button" className={preset === value ? "active" : ""} onClick={() => pickPreset(value)} aria-label={`Date range: ${label}`}>{label}</button>)}
      </div>
      <div className="date-inputs">
        <label><span>From</span><input aria-label="Report start date" type="date" value={range.start} onChange={(event) => setManual("start", event.target.value)} /></label>
        <label><span>To</span><input aria-label="Report end date" type="date" value={range.end} onChange={(event) => setManual("end", event.target.value)} /></label>
      </div>
      <p className="field-note">Both reports below use this date range, based on the invoice date. Returns reduce the totals. Commission uses each person&apos;s stored rate from the Sales Team page. Profit uses each product&apos;s current cost in the catalog.</p>
    </section>

    <div className="analytics-totals" aria-label="Period totals">
      <div><span>Net sales (before tax)</span><strong>{totals ? money(totals.subtotal_cents) : "—"}</strong></div>
      <div><span>Total with tax</span><strong>{totals ? money(totals.total_cents) : "—"}</strong></div>
      <div><span>Profit</span><strong>{totals ? money(totals.profit_cents) : "—"}</strong></div>
      <div><span>Invoices</span><strong>{totals ? totals.sale_count.toLocaleString() : "—"}</strong></div>
      <div><span>Units sold</span><strong>{totals ? totals.units_sold.toLocaleString() : "—"}</strong></div>
      <div><span>Still on account</span><strong>{totals ? money(totals.balance_cents) : "—"}</strong></div>
    </div>

    <section className="inventory-section">
      <div className="section-heading"><div><p>COMMISSIONS</p><h1>Salesperson summary</h1></div><button type="button" className="secondary-button print-report-button" onClick={printReport} disabled={!people.data}><PrinterIcon /> Print report</button></div>
      {people.isPending ? <div className="loading-list"><span /><span /></div> : people.data && people.data.totals.sale_count === 0 ? <div className="empty-state"><h2>No sales in this period</h2><p>Try a wider date range — invoices in the period you pick will show up here per salesperson.</p></div> : <>
        <div className="salesperson-summary analytics-people">
          {people.data?.rows.map((row) => <button key={row.salesperson} type="button" className={`salesperson-card ${personFilter === row.salesperson ? "active" : ""}`} onClick={() => setPersonFilter((current) => current === row.salesperson ? null : row.salesperson)} aria-label={`Filter invoices by ${row.salesperson}`}>
            <strong>{row.salesperson}</strong>
            <span>{row.sale_count} sale{row.sale_count === 1 ? "" : "s"} · {row.units_sold} units · avg {money(row.avg_sale_cents)}</span>
            <b>{money(row.subtotal_cents)}</b>
            <small>net sales before tax</small>
            <small>Total {money(row.total_cents)} · Collected {money(row.paid_cents)} · On account {money(row.balance_cents)}</small>
            <small>Profit {money(row.profit_cents)}{row.returns_cents > 0 ? ` · Returns ${money(row.returns_cents)}` : ""}</small>
            <span className="commission-due">Commission {(row.commission_bps / 100).toFixed(2)}% · due {money(row.commission_cents)}</span>
          </button>)}
        </div>
        {totals ? <p className="field-note">Total commission due for this period: <b>{money(totals.commission_cents)}</b> — each person at their stored rate from the Sales Team page. Tap a salesperson to see just their invoices below.</p> : null}
        <div className="sales-report-list analytics-invoices">
          {people.data?.sales.length === 0 ? <p className="quiet-empty">No invoices {personFilter ? `by ${personFilter} ` : ""}in this period.</p> : people.data?.sales.map((sale) => <article key={sale.id} className="sales-report-row"><div><strong>{sale.invoice_number !== null ? `Invoice #${sale.invoice_number}` : "Invoice"} · {sale.customer_name}</strong><span>{when(sale.created_at)} · Sold by {sale.salesperson} · {sale.status}</span></div><div className="sales-report-amounts"><b>{money(sale.total_cents)}</b><small>{money(sale.paid_cents)} paid{sale.balance_cents > 0 ? ` · ${money(sale.balance_cents)} due` : ""}</small></div></article>)}
        </div>
      </>}
    </section>

    <section className="inventory-section">
      <div className="section-heading"><div><p>BY ITEM</p><h1>Sales by item</h1></div><span>{items.data ? `${items.data.totals.item_count} items · ${items.data.totals.units_sold.toLocaleString()} units` : "—"}</span></div>
      <div className="item-sort-row">
        <label><span>Sort items by</span><select aria-label="Sort items by" value={sortBy} onChange={(event) => { setSortBy(event.target.value as ItemSort); setSortDir(event.target.value === "title" ? "asc" : "desc"); }}><option value="profit">Profit $</option><option value="units">Units sold</option><option value="revenue">Revenue</option><option value="margin">Margin %</option><option value="title">Item name</option></select></label>
        <button type="button" className="secondary-button" onClick={() => setSortDir((dir) => dir === "desc" ? "asc" : "desc")} aria-label="Toggle sort direction">{sortDir === "desc" ? "Highest first ↓" : "Lowest first ↑"}</button>
      </div>
      {items.isPending ? <div className="loading-list"><span /><span /></div> : items.data && items.data.rows.length === 0 ? <div className="empty-state"><h2>No items sold in this period</h2><p>Item sales in the period you pick will rank here by profit, units, and revenue.</p></div> : <div className="pricing-list analytics-items">
        <div className="analytics-item-columns" aria-hidden="true"><span>Item</span><span>Units</span><span>Revenue</span><span>Profit</span><span>Margin</span></div>
        {items.data?.rows.map((row) => <div key={row.product_id} className="analytics-item-row">
          <span className="product-thumb">{row.thumbnail_url ? <img src={row.thumbnail_url} alt="" /> : (row.vendor || row.product_title).slice(0, 2).toUpperCase()}</span>
          <span className="pricing-product"><strong>{row.product_title}</strong><small>{row.part_number ? `Part # ${row.part_number}` : row.sku ? `SKU ${row.sku}` : row.vendor || "—"} · {row.sale_count} invoice{row.sale_count === 1 ? "" : "s"}{row.returned_units > 0 ? ` · ${row.returned_units} returned` : ""}</small></span>
          <span data-label="Units">{row.units_sold.toLocaleString()}</span>
          <span data-label="Revenue">{money(row.revenue_cents)}</span>
          <span data-label="Profit" className={row.profit_cents < 0 ? "negative-markup" : "markup-value"}>{money(row.profit_cents)}</span>
          <span data-label="Margin">{percent(row.margin_bps)}</span>
        </div>)}
        {items.data ? <div className="analytics-item-total"><span>Totals</span><b>{items.data.totals.units_sold.toLocaleString()} units</b><b>{money(items.data.totals.revenue_cents)} revenue</b><b>{money(items.data.totals.profit_cents)} profit</b></div> : null}
      </div>}
      <div className="item-sort-heads" aria-label="Sort by column">
        <span>Quick sort:</span>
        {([["profit", "Profit $"], ["units", "Units"], ["revenue", "Revenue"], ["margin", "Margin"]] as Array<[ItemSort, string]>).map(([key, label]) => <button key={key} type="button" className={sortBy === key ? "active" : ""} onClick={() => toggleSort(key)} aria-label={`Sort items by ${label}`}>{label}{sortMark(key)}</button>)}
      </div>
    </section>
  </>;
}

type PurchaseOrder = ApiResponse<typeof api, "listPurchaseOrders">["orders"][number];
type PoItem = PurchaseOrder["items"][number];

function poText(order: PurchaseOrder): string {
  const lines = order.items.map((item) => `${item.quantity} × ${item.product_title}${item.supplier_part_number ? `  [${order.supplier_label} # ${item.supplier_part_number}]` : ""} @ ${money(item.unit_cost_cents)} — ${money(item.line_total_cents)}`);
  return [
    "RIMA SUPPLY COMPANY",
    `PURCHASE ORDER ${order.po_number !== null ? `#${order.po_number}` : ""} — ${order.supplier_label.toUpperCase()}`,
    `Status: ${order.status}`,
    `Created: ${when(order.created_at)}`,
    order.approved_at ? `Approved: ${when(order.approved_at)}` : "",
    "",
    ...lines,
    "",
    `Total: ${money(order.total_cents)}`,
    order.notes ? `\nNotes: ${order.notes}` : "",
  ].filter((line) => line !== "").join("\n");
}

function SupplierInfoEditor({ productId, onClose }: { productId: number; onClose: () => void }) {
  const queryClient = useQueryClient();
  const productQuery = useQuery({ queryKey: ["supplier-info-product", productId], queryFn: () => api.getProduct({ id: productId }) });
  const product = productQuery.data?.product ?? null;
  const [inbound, setInbound] = useState<string | null>(null);
  const [medcoCost, setMedcoCost] = useState<string | null>(null);
  const [oakCost, setOakCost] = useState<string | null>(null);
  const [medcoMoq, setMedcoMoq] = useState<string | null>(null);
  const [oakMoq, setOakMoq] = useState<string | null>(null);
  const [medcoAvailable, setMedcoAvailable] = useState<boolean | null>(null);
  const [oakAvailable, setOakAvailable] = useState<boolean | null>(null);
  const [message, setMessage] = useState("");
  const save = useMutation({
    mutationFn: () => api.updateSupplierInfo({
      id: productId,
      inbound_qty: Math.max(0, Number.parseInt(inbound ?? "0", 10) || 0),
      medco_cost_cents: cents(medcoCost ?? "0"),
      oak_cost_cents: cents(oakCost ?? "0"),
      medco_moq: Math.max(1, Number.parseInt(medcoMoq ?? "1", 10) || 1),
      oak_moq: Math.max(1, Number.parseInt(oakMoq ?? "1", 10) || 1),
      medco_available: medcoAvailable ?? true,
      oak_available: oakAvailable ?? true,
    }),
    onSuccess: async (result) => { if (!result.ok) { setMessage(result.error ?? "Could not save supplier info."); return; } await queryClient.invalidateQueries(); onClose(); },
    onError: () => setMessage("Could not save supplier info. Try again."),
  });
  if (productQuery.isPending || !product) {
    return <div className="sheet-backdrop" role="presentation"><section className="detail-sheet" role="dialog" aria-modal="true" aria-label="Supplier information"><div className="sheet-handle" /><p className="quiet-empty">{productQuery.isPending ? "Loading product…" : "That product could not be found."}</p><div className="form-actions"><button className="secondary-button" onClick={onClose}>Close</button></div></section></div>;
  }
  const inboundValue = inbound ?? String(product.inbound_qty);
  const medcoCostValue = medcoCost ?? decimal(product.medco_cost_cents);
  const oakCostValue = oakCost ?? decimal(product.oak_cost_cents);
  const medcoMoqValue = medcoMoq ?? String(product.medco_moq);
  const oakMoqValue = oakMoq ?? String(product.oak_moq);
  const medcoAvailableValue = medcoAvailable ?? product.medco_available;
  const oakAvailableValue = oakAvailable ?? product.oak_available;
  return <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="detail-sheet" role="dialog" aria-modal="true" aria-labelledby="supplier-info-title"><div className="sheet-handle" /><header className="sheet-header"><div><p>SUPPLIER INFO</p><h2 id="supplier-info-title">{product.title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close supplier info"><CloseIcon /></button></header>
    <ProductGallery images={productImages(product)} title={product.title} />
    <div className="detail-meta"><span><b>Medco #</b>{product.medco_part_number || "Not set"}</span><span><b>National Oak #</b>{product.oak_part_number || "Not set"}</span><span><b>Catalog cost</b>{money(product.cost_cents)}</span></div>
    <ProductFullDescription product={product} />
    <form className="pricing-form" onSubmit={(event) => { event.preventDefault(); setMessage(""); save.mutate(); }}>
      <div className="form-grid">
        <label><span>Inbound / already on order</span><input aria-label="Inbound quantity already on order" type="number" min="0" step="1" value={inboundValue} onChange={(event) => setInbound(event.target.value)} /></label>
        <label><span>Medco cost</span><div className="money-input"><b>$</b><input aria-label="Medco cost" type="number" min="0" step="0.01" value={medcoCostValue} onChange={(event) => setMedcoCost(event.target.value)} /></div></label>
        <label><span>National Oak cost</span><div className="money-input"><b>$</b><input aria-label="National Oak cost" type="number" min="0" step="0.01" value={oakCostValue} onChange={(event) => setOakCost(event.target.value)} /></div></label>
        <label><span>Medco minimum qty</span><input aria-label="Medco minimum order quantity" type="number" min="1" step="1" value={medcoMoqValue} onChange={(event) => setMedcoMoq(event.target.value)} /></label>
        <label><span>National Oak minimum qty</span><input aria-label="National Oak minimum order quantity" type="number" min="1" step="1" value={oakMoqValue} onChange={(event) => setOakMoq(event.target.value)} /></label>
      </div>
      <div className="supplier-availability">
        <label><input type="checkbox" checked={medcoAvailableValue} onChange={(event) => setMedcoAvailable(event.target.checked)} /> Medco has it available</label>
        <label><input type="checkbox" checked={oakAvailableValue} onChange={(event) => setOakAvailable(event.target.checked)} /> National Oak has it available</label>
      </div>
      <p className="field-note">Part numbers themselves live in Products → Supplier cross-reference. Costs of $0.00 mean "use catalog cost" when the generator compares warehouses.</p>
      {message ? <p className="form-error" role="alert">{message}</p> : null}
      <div className="form-actions"><button className="secondary-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save supplier info"}</button></div>
    </form>
  </section></div>;
}

function SupplierSettingsPanel() {
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ["supplier-settings"], queryFn: () => api.getSupplierSettings({}) });
  const [medcoMin, setMedcoMin] = useState<string | null>(null);
  const [oakMin, setOakMin] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const save = useMutation({
    mutationFn: () => api.updateSupplierSettings({ medco_min_order_cents: cents(medcoMin ?? "0"), oak_min_order_cents: cents(oakMin ?? "0") }),
    onSuccess: async (result) => { if (!result.ok) { setMessage(result.error ?? "Could not save."); return; } setMedcoMin(null); setOakMin(null); setMessage("Saved. Draft orders below a supplier's minimum get flagged before approval."); await queryClient.invalidateQueries(); },
    onError: () => setMessage("Could not save supplier settings."),
  });
  const medcoValue = medcoMin ?? (settings.data ? decimal(settings.data.medco_min_order_cents) : "");
  const oakValue = oakMin ?? (settings.data ? decimal(settings.data.oak_min_order_cents) : "");
  return <section className="settings-panel po-settings"><div className="settings-copy"><h2>Supplier minimum orders</h2><p>The smallest total order each warehouse will take. Leave at $0.00 if a supplier has no minimum. The generator still builds the order below a minimum — it just flags it so you can add lines or approve it knowingly.</p></div>
    <form onSubmit={(event) => { event.preventDefault(); setMessage(""); save.mutate(); }}>
      <div className="form-grid">
        <label><span>Medco minimum order</span><div className="money-input"><b>$</b><input aria-label="Medco minimum order total" type="number" min="0" step="0.01" value={medcoValue} onChange={(event) => setMedcoMin(event.target.value)} /></div></label>
        <label><span>National Oak minimum order</span><div className="money-input"><b>$</b><input aria-label="National Oak minimum order total" type="number" min="0" step="0.01" value={oakValue} onChange={(event) => setOakMin(event.target.value)} /></div></label>
      </div>
      {message ? <p className={message.startsWith("Saved") ? "settings-success" : "form-error"} role="status">{message}</p> : null}
      <div className="form-actions"><button className="primary-button" type="submit" disabled={save.isPending || settings.isPending}>{save.isPending ? "Saving…" : "Save minimums"}</button></div>
    </form>
  </section>;
}

function PoLineRow({ order, item }: { order: PurchaseOrder; item: PoItem }) {
  const queryClient = useQueryClient();
  const [qty, setQty] = useState(String(item.quantity));
  const [message, setMessage] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  useEffect(() => { setQty(String(item.quantity)); }, [item.quantity]);
  const editable = order.status === "draft";
  const refresh = async () => { await queryClient.invalidateQueries({ queryKey: ["purchase-orders"] }); await queryClient.invalidateQueries({ queryKey: ["reorder-needs"] }); };
  const saveQty = useMutation({ mutationFn: () => api.updatePurchaseOrderLine({ po_id: order.id, item_id: item.id, quantity: Math.max(0, Number.parseInt(qty || "0", 10) || 0) }), onSuccess: async (result) => { if (!result.ok) { setMessage(result.error ?? "Could not update that line."); return; } setMessage(""); await refresh(); }, onError: () => setMessage("Could not update that line.") });
  const remove = useMutation({ mutationFn: () => api.removePurchaseOrderLine({ po_id: order.id, item_id: item.id }), onSuccess: async (result) => { if (!result.ok) { setMessage(result.error ?? "Could not remove that line."); return; } await refresh(); }, onError: () => setMessage("Could not remove that line.") });
  const move = useMutation({ mutationFn: () => api.movePurchaseOrderLine({ po_id: order.id, item_id: item.id }), onSuccess: async (result) => { if (!result.ok) { setMessage(result.error ?? "Could not move that line."); return; } await refresh(); }, onError: () => setMessage("Could not move that line.") });
  const parsedQty = Number.parseInt(qty || "0", 10);
  const qtyChanged = Number.isInteger(parsedQty) && parsedQty !== item.quantity;
  const altLabel = item.alt_supplier === "medco" ? "Medco" : item.alt_supplier === "oak" ? "National Oak" : "";
  return <article className="po-line">
    <div className="po-line-main">
      <strong>{item.product_title}</strong>
      <small>{order.supplier_label} # {item.supplier_part_number || "—"} · {money(item.unit_cost_cents)} each{item.moq > 1 ? ` · min qty ${item.moq}` : ""}</small>
      <small className="po-line-math">Par {item.par_level} − on hand {item.on_hand} − inbound {item.inbound_qty} = need {item.need_qty}{item.suggested_quantity !== item.need_qty ? ` · ordered ${item.suggested_quantity} (minimum)` : ""}</small>
      <small className="po-line-reason">{item.choice_reason}</small>
      {message ? <p className="form-error" role="alert">{message}</p> : null}
    </div>
    {editable ? <div className="po-line-edit">
      <label><span>Qty</span><input aria-label={`Order quantity for ${item.product_title}`} type="number" min="0" step="1" value={qty} onChange={(event) => setQty(event.target.value)} /></label>
      <strong>{money(item.line_total_cents)}</strong>
      <div className="po-line-actions">
        {qtyChanged ? <button type="button" className="primary-button po-small-button" disabled={saveQty.isPending} onClick={() => saveQty.mutate()}>{saveQty.isPending ? "Saving…" : "Save qty"}</button> : null}
        {item.alt_available ? <button type="button" className="secondary-button po-small-button" disabled={move.isPending} onClick={() => move.mutate()}>Move to {altLabel} ({money(item.alt_cost_cents)})</button> : null}
        {confirmRemove ? <span className="po-confirm-inline">Remove this line? <button type="button" className="link-button danger-link" disabled={remove.isPending} onClick={() => remove.mutate()}>Yes, remove</button> <button type="button" className="link-button" onClick={() => setConfirmRemove(false)}>Keep</button></span> : <button type="button" className="link-button danger-link" onClick={() => setConfirmRemove(true)}>Remove</button>}
      </div>
    </div> : <div className="po-line-edit"><span className="po-line-qty">{item.quantity} × {money(item.unit_cost_cents)}</span><strong>{money(item.line_total_cents)}</strong></div>}
  </article>;
}

function PurchaseOrderCard({ order }: { order: PurchaseOrder }) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [showDoc, setShowDoc] = useState(false);
  const [poPrintNote, setPoPrintNote] = useState("");
  const [confirming, setConfirming] = useState<"approve" | "cancel" | "receive" | null>(null);
  const printPo = () => {
    setPoPrintNote("Preparing print preview…");
    void buildPoPdfBlob(poPdfData(order))
      .then((blob) => { openPdfInTab(blob); setPoPrintNote(""); })
      .catch(() => {
        printDocument(`RIMA Purchase Order ${order.po_number ?? ""} — ${order.supplier_label}`, poText(order), <PurchaseOrderDocument data={poPdfData(order)} />);
        setPoPrintNote("");
      });
  };
  const savePo = () => {
    setPoPrintNote("Preparing the purchase order PDF…");
    void downloadPoPdf(`RIMA-PO-${order.po_number ?? order.id}.pdf`, poPdfData(order))
      .then(() => setPoPrintNote("Purchase order PDF downloaded — open it from Downloads to print, email, or send to the supplier."))
      .catch(() => setPoPrintNote("Could not build the PDF — try Print instead."));
  };
  const refresh = async () => { await queryClient.invalidateQueries({ queryKey: ["purchase-orders"] }); await queryClient.invalidateQueries({ queryKey: ["reorder-needs"] }); await queryClient.invalidateQueries({ queryKey: ["inventory-stats"] }); await queryClient.invalidateQueries({ queryKey: ["products"] }); };
  const approve = useMutation({ mutationFn: () => api.approvePurchaseOrder({ po_id: order.id, confirm_below_minimum: order.below_min_order }), onSuccess: async (result) => { if (!result.ok) { setMessage(result.error ?? "Could not approve this order."); return; } setConfirming(null); setMessage("Approved. Those quantities now count as inbound, so next week's run won't reorder them. Send the PO to the supplier when you're ready — nothing was sent automatically."); await refresh(); }, onError: () => setMessage("Could not approve this order.") });
  const cancel = useMutation({ mutationFn: () => api.cancelPurchaseOrder({ po_id: order.id }), onSuccess: async (result) => { if (!result.ok) { setMessage(result.error ?? "Could not cancel this order."); return; } setConfirming(null); setMessage(""); await refresh(); }, onError: () => setMessage("Could not cancel this order.") });
  const receive = useMutation({ mutationFn: () => api.receivePurchaseOrder({ po_id: order.id }), onSuccess: async (result) => { if (!result.ok) { setMessage(result.error ?? "Could not receive this order."); return; } setConfirming(null); setMessage("Received. Stock is on the shelf and inbound is cleared for these lines."); await refresh(); }, onError: () => setMessage("Could not receive this order.") });
  const statusLabel = order.status === "draft" ? "Draft — waiting for your review" : order.status === "approved" ? "Approved — on order" : order.status === "received" ? "Received" : "Cancelled";
  return <section className={`po-card status-${order.status}`}>
    <header className="po-card-head">
      <div><p>{order.supplier_label.toUpperCase()}</p><h2>PO {order.po_number !== null ? `#${order.po_number}` : ""}</h2><span>{statusLabel} · {order.item_count} line{order.item_count === 1 ? "" : "s"} · {order.unit_count} units · made {when(order.created_at)}{order.approved_at ? ` · approved ${when(order.approved_at)}` : ""}{order.received_at ? ` · received ${when(order.received_at)}` : ""}</span></div>
      <div className="po-card-total"><span>Total</span><strong>{money(order.total_cents)}</strong></div>
    </header>
    {order.below_min_order && order.status === "draft" ? <p className="po-min-warning" role="alert">This order is {money(order.min_order_cents - order.total_cents)} under {order.supplier_label}&apos;s {money(order.min_order_cents)} minimum order. Add lines, combine with next week, or approve it anyway below.</p> : null}
    <div className="po-lines">{order.items.map((item) => <PoLineRow key={item.id} order={order} item={item} />)}</div>
    {showDoc ? <div className="po-doc-wrap"><PurchaseOrderDocument data={poPdfData(order)} /></div> : null}
    {poPrintNote ? <p className="delivery-note" role="status">{poPrintNote}</p> : null}
    {message ? <p className={message.startsWith("Approved") || message.startsWith("Received") ? "settings-success po-message" : "form-error po-message"} role="status">{message}</p> : null}
    <div className="po-card-actions">
      <button type="button" className="secondary-button po-print-button" onClick={printPo} aria-label={`Print purchase order ${order.po_number ?? ""}`}><PrinterIcon /> Print / PDF PO</button>
      <button type="button" className="secondary-button po-print-button" onClick={savePo} aria-label={`Download purchase order ${order.po_number ?? ""} as PDF`}><DownloadIcon /> Save PDF</button>
      <button type="button" className="secondary-button po-print-button" onClick={() => setShowDoc((v) => !v)} aria-expanded={showDoc} aria-label={`${showDoc ? "Hide" : "View"} purchase order ${order.po_number ?? ""} document`}>{showDoc ? "Hide document" : "View document"}</button>
      {order.status === "draft" ? <>
        {confirming === "approve" ? <span className="po-confirm-box">Approve PO {order.po_number !== null ? `#${order.po_number}` : ""} for {money(order.total_cents)}? The quantities become inbound/on-order stock. Nothing is sent to {order.supplier_label} — you still place the order with them. <button type="button" className="primary-button" disabled={approve.isPending} onClick={() => approve.mutate()}>{approve.isPending ? "Approving…" : "Yes, approve"}</button> <button type="button" className="secondary-button" onClick={() => setConfirming(null)}>Keep reviewing</button></span>
        : confirming === "cancel" ? <span className="po-confirm-box">Cancel this draft? The products go back to needing an order on the next run. <button type="button" className="primary-button" disabled={cancel.isPending} onClick={() => cancel.mutate()}>{cancel.isPending ? "Cancelling…" : "Yes, cancel draft"}</button> <button type="button" className="secondary-button" onClick={() => setConfirming(null)}>Keep it</button></span>
        : <><button type="button" className="primary-button po-approve-button" onClick={() => setConfirming("approve")}>Approve PO{order.below_min_order ? " anyway" : ""}</button><button type="button" className="link-button danger-link" onClick={() => setConfirming("cancel")}>Cancel draft</button></>}
      </> : null}
      {order.status === "approved" ? <>
        {confirming === "receive" ? <span className="po-confirm-box">The truck showed up? Marking received adds these quantities to on-hand and clears them from inbound. <button type="button" className="primary-button" disabled={receive.isPending} onClick={() => receive.mutate()}>{receive.isPending ? "Receiving…" : "Yes, it's here"}</button> <button type="button" className="secondary-button" onClick={() => setConfirming(null)}>Not yet</button></span>
        : confirming === "cancel" ? <span className="po-confirm-box">Cancel this approved order? The inbound quantities come back off, so the items show as needed again. <button type="button" className="primary-button" disabled={cancel.isPending} onClick={() => cancel.mutate()}>{cancel.isPending ? "Cancelling…" : "Yes, cancel order"}</button> <button type="button" className="secondary-button" onClick={() => setConfirming(null)}>Keep it</button></span>
        : <><button type="button" className="primary-button po-approve-button" onClick={() => setConfirming("receive")}>Mark received</button><button type="button" className="link-button danger-link" onClick={() => setConfirming("cancel")}>Cancel order</button></>}
      </> : null}
    </div>
  </section>;
}

type ReceivingDocument = ApiResponse<typeof api, "listReceivingDocuments">["documents"][number];
type ReceivingLine = ReceivingDocument["lines"][number];

function ReceivingUploadPanel({ onUploaded }: { onUploaded: (document: ReceivingDocument) => void }) {
  const queryClient = useQueryClient();
  const [supplier, setSupplier] = useState<"auto" | "medco" | "oak">("auto");
  const [fileName, setFileName] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [message, setMessage] = useState("");
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      if (!isPdf) throw new Error("Choose a PDF invoice or packing list.");
      if (file.size > 12000000) throw new Error("That PDF is larger than 12 MB.");
      const encoded = await fileToBase64(file);
      return api.uploadReceivingPdf({ file_name: file.name, data_base64: encoded.dataBase64, mime_type: "application/pdf", supplier_preference: supplier });
    },
    onSuccess: async (result) => {
      if (!result.ok || !result.document) { setMessage(result.error ?? "Could not read that PDF."); return; }
      setMessage(result.document.line_count > 0 ? `Read ${result.document.line_count} line${result.document.line_count === 1 ? "" : "s"} from ${result.document.file_name}. Review the matches and quantities below before receiving.` : `Saved ${result.document.file_name}, but no shipment lines could be read. Open it below to see what happened.`);
      await queryClient.invalidateQueries({ queryKey: ["receiving-documents"] });
      onUploaded(result.document);
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : "Could not upload that PDF."),
  });
  const choose = (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    setMessage("");
    upload.mutate(file);
  };
  return <section className="receiving-upload" aria-labelledby="receiving-upload-title">
    <div className="receiving-upload-head">
      <div><p>WAREHOUSE RECEIVING</p><h2 id="receiving-upload-title">Upload an invoice or packing list</h2><span>Drop the PDF here. Shipped quantities, backorders, and cost changes are pulled into a review — stock does not move until you receive it.</span></div>
      <FileIcon />
    </div>
    <div className="receiving-upload-grid">
      <label className={`file-drop receiving-drop ${dragActive ? "drag-active" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragActive(true); }} onDragLeave={() => setDragActive(false)} onDrop={(event) => { event.preventDefault(); setDragActive(false); choose(event.dataTransfer.files?.[0]); }}>
        <UploadIcon />
        <strong>{upload.isPending ? "Reading PDF…" : fileName || "Drop a warehouse PDF or choose a file"}</strong>
        <span>Medco or National Oak invoice / packing list · PDF up to 12 MB</span>
        <input aria-label="Upload warehouse invoice or packing list PDF" type="file" accept="application/pdf,.pdf" disabled={upload.isPending} onChange={(event) => { choose(event.target.files?.[0]); event.target.value = ""; }} />
      </label>
      <label className="receiving-supplier-choice"><span>Warehouse on this document</span><select aria-label="Warehouse on this document" value={supplier} onChange={(event) => setSupplier(event.target.value as "auto" | "medco" | "oak")}><option value="auto">Read it from the PDF</option><option value="medco">Medco</option><option value="oak">National Oak</option></select><small>Lines are matched with the supplier cross-reference — Medco # and National Oak # — including the MMM / 3M and leading-zero differences.</small></label>
    </div>
    {message ? <p className={message.startsWith("Read") || message.startsWith("Saved") ? "settings-success" : "form-error"} role="status">{message}</p> : null}
  </section>;
}

function ReceivingLineRow({ document, line }: { document: ReceivingDocument; line: ReceivingLine }) {
  const queryClient = useQueryClient();
  const editable = document.status === "needs_review";
  const [includeLine, setIncludeLine] = useState(line.include_line);
  const [orderedQty, setOrderedQty] = useState(String(line.ordered_qty));
  const [shippedQty, setShippedQty] = useState(String(line.shipped_qty));
  const [backorderQty, setBackorderQty] = useState(String(line.backorder_qty));
  const [unitCost, setUnitCost] = useState(decimal(line.unit_cost_cents));
  const [productId, setProductId] = useState<number | null>(line.product_id);
  const [productLabel, setProductLabel] = useState(line.product_title);
  const [productSearch, setProductSearch] = useState("");
  const deferredSearch = useDeferredValue(productSearch);
  const [message, setMessage] = useState("");
  const productResults = useQuery({ queryKey: ["receiving-product-search", deferredSearch], queryFn: () => api.listProducts({ query: deferredSearch, mode: "all", limit: 12, offset: 0 }), enabled: editable && deferredSearch.trim().length > 0 });
  const dirty = includeLine !== line.include_line || orderedQty !== String(line.ordered_qty) || shippedQty !== String(line.shipped_qty) || backorderQty !== String(line.backorder_qty) || cents(unitCost) !== line.unit_cost_cents || productId !== line.product_id;
  const refresh = async () => { await queryClient.invalidateQueries({ queryKey: ["receiving-documents"] }); await queryClient.invalidateQueries({ queryKey: ["products"] }); await queryClient.invalidateQueries({ queryKey: ["inventory-stats"] }); };
  const save = useMutation({
    mutationFn: () => api.updateReceivingLine({ document_id: document.id, line_id: line.id, product_id: productId, ordered_qty: Math.max(0, Number.parseInt(orderedQty || "0", 10) || 0), shipped_qty: Math.max(0, Number.parseInt(shippedQty || "0", 10) || 0), backorder_qty: Math.max(0, Number.parseInt(backorderQty || "0", 10) || 0), unit_cost_cents: cents(unitCost), include_line: includeLine }),
    onSuccess: async (result) => { if (!result.ok) { setMessage(result.error ?? "Could not save that line."); return; } setMessage("Line saved."); await refresh(); },
    onError: () => setMessage("Could not save that line."),
  });
  const decideCost = useMutation({
    mutationFn: (decision: "approved" | "rejected") => api.decideReceivingCostChange({ line_id: line.id, decision }),
    onSuccess: async (result) => { if (!result.ok) { setMessage(result.error ?? "Could not save that cost decision."); return; } setMessage(decisionMessage(result.document?.lines.find((item) => item.id === line.id)?.cost_change_status)); await refresh(); },
    onError: () => setMessage("Could not save that cost decision."),
  });
  const decisionMessage = (status: ReceivingLine["cost_change_status"] | undefined) => status === "approved" ? "New cost approved. Cost updated and your markup % left unchanged — the recalculated customer price is waiting in Markup Rules for your approval; MSRP was left alone." : "Cost change rejected. The current cost stays in place.";
  const costChanged = line.cost_change_status === "pending";
  return <article className={`receiving-line ${line.product_id === null ? "unmatched" : ""}`}>
    <div className="receiving-line-head">
      {editable ? <label className="receiving-include"><input type="checkbox" checked={includeLine} onChange={(event) => setIncludeLine(event.target.checked)} aria-label={`Include ${line.raw_description || line.raw_part_number || "receiving line"} in this shipment`} /><span>Receive</span></label> : <span className={`receiving-status-chip ${document.status}`}>{document.status === "received" ? "Received" : "Cancelled"}</span>}
      <div className="receiving-line-title"><strong>{line.raw_part_number || "No part number read"}</strong><span>{line.raw_description || "No description read"}</span></div>
      <div className="receiving-line-amount"><span>Line cost</span><b>{line.unit_cost_cents > 0 ? money(line.unit_cost_cents) : "—"}</b></div>
    </div>

    <div className={`receiving-match ${line.product_id === null ? "missing" : ""}`}>
      {line.product_id !== null ? <><CheckIcon /><span><strong>{productLabel || line.product_title}</strong><small>{line.matched_by || "Matched product"}{line.product_part_number ? ` · Part # ${line.product_part_number}` : ""} · On hand {line.current_on_hand} · Inbound {line.current_inbound_qty}</small><small>Medco # {line.product_medco_part_number || "—"} · National Oak # {line.product_oak_part_number || "—"}</small></span></> : <><CloseIcon /><span><strong>No product matched</strong><small>Assign the catalog product below, or leave this line unchecked so the rest can be received.</small></span></>}
    </div>

    {editable ? <div className="receiving-product-picker">
      <SearchField value={productSearch} onChange={setProductSearch} placeholder={line.product_id !== null ? "Search to change the matched product" : "Search products to assign this line"} label={`Assign product for ${line.raw_part_number || line.raw_description || "receiving line"}`} />
      {productId !== line.product_id ? <p className="receiving-assignment-note">Assigned: <b>{productLabel || "No product"}</b>{productId === null ? " — this line will stay unmatched." : ""}</p> : null}
      {productSearch ? <div className="picker-results receiving-picker-results">{productResults.isPending ? <p className="quiet-empty field-list-note">Searching products…</p> : productResults.data?.products.length ? productResults.data.products.map((product) => <button key={product.id} type="button" onClick={() => { setProductId(product.id); setProductLabel(product.title); setProductSearch(""); }}><span><strong>{product.title}</strong><small>Part # {product.part_number || product.sku || "—"} · Medco # {product.medco_part_number || "—"} · Oak # {product.oak_part_number || "—"}</small></span><b>{product.quantity} on hand</b></button>) : <p className="quiet-empty field-list-note">No products match that search.</p>}</div> : null}
      {line.product_id !== null ? <button type="button" className="link-button danger-link" onClick={() => { setProductId(null); setProductLabel(""); }}>Clear product match</button> : null}
    </div> : null}

    {editable ? <div className="receiving-line-fields">
      <label><span>Ordered</span><input aria-label={`Ordered quantity for ${line.raw_part_number || line.raw_description}`} type="number" min="0" step="1" value={orderedQty} onChange={(event) => setOrderedQty(event.target.value)} /></label>
      <label><span>Shipped</span><input aria-label={`Shipped quantity for ${line.raw_part_number || line.raw_description}`} type="number" min="0" step="1" value={shippedQty} onChange={(event) => setShippedQty(event.target.value)} /></label>
      <label><span>Backordered</span><input aria-label={`Backordered quantity for ${line.raw_part_number || line.raw_description}`} type="number" min="0" step="1" value={backorderQty} onChange={(event) => setBackorderQty(event.target.value)} /></label>
      <label><span>Unit cost</span><div className="money-input"><b>$</b><input aria-label={`Unit cost for ${line.raw_part_number || line.raw_description}`} type="number" min="0" step="0.01" value={unitCost} onChange={(event) => setUnitCost(event.target.value)} /></div></label>
    </div> : <div className="receiving-line-summary"><span>Ordered <b>{line.ordered_qty}</b></span><span>Shipped <b>{line.shipped_qty}</b></span><span>Backordered <b>{line.backorder_qty}</b></span><span>Unit cost <b>{line.unit_cost_cents > 0 ? money(line.unit_cost_cents) : "—"}</b></span></div>}
    {line.notes ? <p className="receiving-line-note">{line.notes}</p> : null}

    {line.unit_cost_cents > 0 ? <div className={`receiving-cost-box ${line.cost_change_status}`}>
      {costChanged ? <><div><strong>Cost change needs your approval</strong><span>Current cost {money(line.current_cost_cents)} → PDF cost {money(line.unit_cost_cents)}. Approving updates the warehouse cost and My cost only — your markup % stays fixed, and the recalculated customer price will be proposed in Markup Rules for your approval. MSRP stays put.</span></div><div className="receiving-cost-actions"><button type="button" className="primary-button po-small-button" disabled={decideCost.isPending || dirty} onClick={() => decideCost.mutate("approved")}>Approve new cost</button><button type="button" className="secondary-button po-small-button" disabled={decideCost.isPending || dirty} onClick={() => decideCost.mutate("rejected")}>Keep current cost</button></div>{dirty ? <small>Save the line edits first, then decide the cost.</small> : null}</> : line.cost_change_status === "approved" ? <><CheckIcon /><span><strong>Cost approved.</strong> {money(line.unit_cost_cents)} is now the cost on file. Markup % unchanged — check Markup Rules for the proposed new customer price. MSRP was not changed.</span></> : line.cost_change_status === "rejected" ? <><CloseIcon /><span><strong>Cost change rejected.</strong> The previous cost remains on file.</span></> : <><CheckIcon /><span><strong>Cost matches.</strong> The PDF cost is the same as the cost already on file.</span></>}
    </div> : <p className="receiving-line-note">No unit cost was read from the PDF for this line.</p>}
    {message ? <p className={message.includes("approved") || message === "Line saved." || message.includes("rejected") ? "settings-success" : "form-error"} role="status">{message}</p> : null}
    {editable && dirty ? <div className="receiving-line-save"><button type="button" className="primary-button" disabled={save.isPending} onClick={() => { setMessage(""); save.mutate(); }}>{save.isPending ? "Saving line…" : "Save line"}</button></div> : null}
  </article>;
}

function ReceivingDocumentCard({ document, initiallyOpen = false }: { document: ReceivingDocument; initiallyOpen?: boolean }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(initiallyOpen);
  const [showPdf, setShowPdf] = useState(false);
  const [confirming, setConfirming] = useState<"receive" | "cancel" | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => { if (initiallyOpen) setOpen(true); }, [initiallyOpen]);
  const refresh = async () => { await queryClient.invalidateQueries({ queryKey: ["receiving-documents"] }); await queryClient.invalidateQueries({ queryKey: ["products"] }); await queryClient.invalidateQueries({ queryKey: ["product-management"] }); await queryClient.invalidateQueries({ queryKey: ["inventory-stats"] }); await queryClient.invalidateQueries({ queryKey: ["reorder-needs"] }); };
  const apply = useMutation({ mutationFn: () => api.applyReceivingDocument({ document_id: document.id }), onSuccess: async (result) => { if (!result.ok) { setMessage(result.error ?? "Could not receive this shipment."); return; } setConfirming(null); setMessage("Received. Shipped quantities are on the shelf, and backordered quantities are now tracked as inbound."); await refresh(); }, onError: () => setMessage("Could not receive this shipment.") });
  const cancel = useMutation({ mutationFn: () => api.cancelReceivingDocument({ document_id: document.id }), onSuccess: async (result) => { if (!result.ok) { setMessage(result.error ?? "Could not cancel this upload."); return; } setConfirming(null); setMessage("Upload cancelled. No stock was changed."); await refresh(); }, onError: () => setMessage("Could not cancel this upload.") });
  const statusLabel = document.status === "needs_review" ? "Needs review" : document.status === "received" ? "Received" : "Cancelled";
  return <section className={`receiving-card status-${document.status}`}>
    <header className="receiving-card-head">
      <div><p>{document.supplier_label.toUpperCase()}{document.supplier_invoice_number ? ` · INVOICE ${document.supplier_invoice_number}` : ""}</p><h3>{document.file_name}</h3><span>{statusLabel} · Uploaded {when(document.created_at)}{document.applied_at ? ` · Received ${when(document.applied_at)}` : ""}</span></div>
      <div className="receiving-card-counts"><span><b>{document.matched_count}/{document.line_count}</b> matched</span><span><b>{document.shipped_units}</b> shipped</span><span><b>{document.backorder_units}</b> backordered</span>{document.pending_cost_changes > 0 ? <span className="cost-count"><b>{document.pending_cost_changes}</b> cost approval{document.pending_cost_changes === 1 ? "" : "s"}</span> : null}</div>
    </header>
    {document.parse_notes ? <p className="receiving-parse-note">{document.parse_notes}</p> : null}
    <div className="receiving-card-actions">
      <button type="button" className="secondary-button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>{open ? "Hide lines" : `Review ${document.line_count} line${document.line_count === 1 ? "" : "s"}`}</button>
      {document.pdf_url ? <button type="button" className="secondary-button" onClick={() => { setShowPdf((value) => !value); setOpen(true); }} aria-expanded={showPdf}>{showPdf ? "Hide PDF" : "View PDF"}</button> : null}
      {document.status === "needs_review" ? <><button type="button" className="primary-button" onClick={() => { setOpen(true); setConfirming("receive"); }}>Receive shipment</button><button type="button" className="link-button danger-link" onClick={() => setConfirming("cancel")}>Cancel upload</button></> : null}
    </div>
    {confirming === "receive" ? <div className="po-confirm-box receiving-confirm">Receive the checked lines? Shipped amounts are added to on-hand (and first consume any inbound already expected), backordered amounts are added to inbound, and unapproved cost changes stay pending — they do not change prices. <button type="button" className="primary-button" disabled={apply.isPending} onClick={() => apply.mutate()}>{apply.isPending ? "Receiving…" : "Yes, receive it"}</button><button type="button" className="secondary-button" onClick={() => setConfirming(null)}>Keep reviewing</button></div> : null}
    {confirming === "cancel" ? <div className="po-confirm-box receiving-confirm">Cancel this upload? No quantities or costs will change. <button type="button" className="primary-button" disabled={cancel.isPending} onClick={() => cancel.mutate()}>{cancel.isPending ? "Cancelling…" : "Yes, cancel"}</button><button type="button" className="secondary-button" onClick={() => setConfirming(null)}>Keep it</button></div> : null}
    {message ? <p className={message.startsWith("Received") || message.startsWith("Upload cancelled") ? "settings-success po-message" : "form-error po-message"} role="status">{message}</p> : null}
    {open ? <div className="receiving-detail">
      {showPdf && document.pdf_url && document.mime_type === "application/pdf" ? <div className="receiving-pdf"><iframe src={document.pdf_url} title={`Warehouse document ${document.file_name}`} className="pdf-frame" /></div> : null}
      {document.lines.length === 0 ? <div className="empty-state"><h2>No lines to review</h2><p>No shipment lines could be read from this PDF. It is still saved here so you can view it or cancel the upload.</p></div> : <div className="receiving-lines">{document.lines.map((line) => <ReceivingLineRow key={`${line.id}-${line.product_id ?? "none"}-${line.ordered_qty}-${line.shipped_qty}-${line.backorder_qty}-${line.unit_cost_cents}-${line.include_line}`} document={document} line={line} />)}</div>}
    </div> : null}
  </section>;
}

function PurchaseOrdersView() {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [generateNote, setGenerateNote] = useState("");
  const [editingProductId, setEditingProductId] = useState<number | null>(null);
  const [openReceivingId, setOpenReceivingId] = useState<string | null>(null);
  const needs = useQuery({ queryKey: ["reorder-needs"], queryFn: () => api.previewReorderNeeds({}) });
  const orders = useQuery({ queryKey: ["purchase-orders"], queryFn: () => api.listPurchaseOrders({ limit: 50 }) });
  const receiving = useQuery({ queryKey: ["receiving-documents"], queryFn: () => api.listReceivingDocuments({ limit: 25 }) });
  const generate = useMutation({
    mutationFn: () => api.generatePurchaseOrders({}),
    onSuccess: async (result) => {
      if (!result.ok) { setMessage(result.error ?? "Could not build the purchase orders."); return; }
      setMessage("");
      setGenerateNote(result.unassigned.length > 0 ? `Built ${result.orders.length} draft order${result.orders.length === 1 ? "" : "s"}. ${result.unassigned.length} item${result.unassigned.length === 1 ? " is" : "s are"} below par but can't be ordered yet — no supplier part number. They're listed above.` : `Built ${result.orders.length} draft order${result.orders.length === 1 ? "" : "s"} — review them below. Nothing is final until you approve.`);
      await queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      await queryClient.invalidateQueries({ queryKey: ["reorder-needs"] });
    },
    onError: () => setMessage("Could not build the purchase orders. Try again."),
  });
  const allOrders = orders.data?.orders ?? [];
  const drafts = allOrders.filter((order) => order.status === "draft");
  const approved = allOrders.filter((order) => order.status === "approved");
  const history = allOrders.filter((order) => order.status === "received" || order.status === "cancelled");
  const needRows = needs.data?.needs ?? [];
  const hasDraft = drafts.length > 0;
  const receivingDocs = receiving.data?.documents ?? [];
  const receivingReview = receivingDocs.filter((doc) => doc.status === "needs_review");
  const receivingHistory = receivingDocs.filter((doc) => doc.status !== "needs_review");
  return <>
    <section className="plain-command"><div><p>PURCHASE & RECEIVING</p><h1>Purchase orders</h1></div><TruckIcon /></section>
    <ReceivingUploadPanel onUploaded={(doc) => setOpenReceivingId(doc.id)} />
    {receiving.isPending ? <div className="loading-list"><span /><span /></div> : receivingReview.length > 0 ? <section className="inventory-section"><div className="section-heading"><div><p>REVIEW BEFORE STOCK MOVES</p><h1>Warehouse shipments waiting</h1></div><span>{receivingReview.length} to review{receiving.data && receiving.data.pending_cost_changes > 0 ? ` · ${receiving.data.pending_cost_changes} cost change${receiving.data.pending_cost_changes === 1 ? "" : "s"} pending` : ""}</span></div><div className="receiving-stack">{receivingReview.map((doc) => <ReceivingDocumentCard key={doc.id} document={doc} initiallyOpen={doc.id === openReceivingId} />)}</div></section> : <section className="inventory-section"><div className="section-heading"><div><p>WAREHOUSE RECEIVING</p><h1>No shipments waiting</h1></div><span>Upload a PDF above</span></div><div className="empty-state"><h2>No warehouse document is waiting for review</h2><p>When a Medco or National Oak invoice or packing list arrives, drop its PDF above. Matched lines, shipped amounts, backorders, and cost changes will wait here for your review.</p></div></section>}
    <p className="field-intro">For every product below par, the order quantity is <b>par − on hand − inbound already on order</b> (never below zero). Each line goes to whichever warehouse — Medco or National Oak — is cheaper for that item and has it available, using the supplier cross-reference, and gets raised to that supplier&apos;s minimum quantity when needed. You review, edit, and approve every draft. <b>Nothing orders itself.</b></p>

    <section className="inventory-section">
      <div className="section-heading"><div><p>REORDER NEEDS</p><h1>{hasDraft ? "Needs are locked into the draft below" : "What needs ordering"}</h1></div><span>{needs.data ? `${needs.data.orderable_count} orderable · ${needs.data.unassigned_count} missing a supplier` : "—"}</span></div>
      {needs.isPending ? <div className="loading-list"><span /><span /></div> : needRows.length === 0 ? <div className="empty-state"><h2>Nothing below par</h2><p>Every product with a par level is stocked at or above par once inbound orders are counted. Set par levels in Inventory to start building reorder needs.</p></div> : <>
        <div className="po-needs-list">
          {needRows.map((need) => <article key={need.product_id} className={`po-need-row ${need.orderable ? "" : "unorderable"}`}>
            <span className="product-thumb">{need.thumbnail_url ? <img src={need.thumbnail_url} alt="" /> : (need.vendor || need.product_title).slice(0, 2).toUpperCase()}</span>
            <span className="po-need-main"><strong>{need.product_title}</strong><small>Par {need.par_level} · On hand {need.on_hand} · Inbound {need.inbound_qty} · <b>Need {need.need_qty}</b>{need.moq_bumped ? ` · order ${need.order_qty} (supplier minimum ${need.chosen_moq})` : ""}</small><small className="po-line-reason">{need.orderable ? `${need.chosen_supplier_label} # ${need.chosen_part_number} @ ${money(need.chosen_cost_cents)} — ${need.choice_reason}` : need.choice_reason}</small></span>
            <span className="po-need-side"><b>{need.orderable ? money(need.order_qty * need.chosen_cost_cents) : "—"}</b><small>{need.orderable ? `${need.order_qty} from ${need.chosen_supplier_label}` : "Can't order yet"}</small><button type="button" className="link-button" onClick={() => setEditingProductId(need.product_id)} aria-label={`Edit supplier info for ${need.product_title}`}>Supplier info</button></span>
          </article>)}
        </div>
        <div className="po-generate-bar">
          <div><span>Medco draft would total <b>{money(needs.data?.medco_total_cents ?? 0)}</b> · National Oak <b>{money(needs.data?.oak_total_cents ?? 0)}</b></span><small>Split line by line at the cheaper warehouse, minimums applied.</small></div>
          {hasDraft ? <p className="field-note">A draft is already waiting below — approve or cancel it to generate a fresh run.</p> : <button type="button" className="primary-button po-generate-button" disabled={generate.isPending || (needs.data?.orderable_count ?? 0) === 0} onClick={() => { setMessage(""); setGenerateNote(""); generate.mutate(); }}>{generate.isPending ? "Building…" : "Generate proposed purchase orders"}</button>}
        </div>
      </>}
      {message ? <p className="form-error po-message" role="alert">{message}</p> : null}
      {generateNote ? <p className="settings-success po-message" role="status">{generateNote}</p> : null}
    </section>

    {drafts.length > 0 ? <section className="inventory-section"><div className="section-heading"><div><p>REVIEW & APPROVE</p><h1>Draft purchase orders</h1></div><span>{drafts.length} draft{drafts.length === 1 ? "" : "s"}</span></div><div className="po-stack">{drafts.map((order) => <PurchaseOrderCard key={order.id} order={order} />)}</div></section> : null}
    {approved.length > 0 ? <section className="inventory-section"><div className="section-heading"><div><p>ON ORDER</p><h1>Approved — waiting on delivery</h1></div><span>{approved.length}</span></div><div className="po-stack">{approved.map((order) => <PurchaseOrderCard key={order.id} order={order} />)}</div></section> : null}
    {history.length > 0 ? <section className="inventory-section"><div className="section-heading"><div><p>HISTORY</p><h1>Past purchase orders</h1></div><span>{history.length}</span></div><div className="po-stack">{history.map((order) => <PurchaseOrderCard key={order.id} order={order} />)}</div></section> : null}
    {receivingHistory.length > 0 ? <section className="inventory-section"><div className="section-heading"><div><p>WAREHOUSE RECEIPTS</p><h1>Received & cancelled uploads</h1></div><span>{receivingHistory.length}</span></div><div className="receiving-stack">{receivingHistory.map((doc) => <ReceivingDocumentCard key={doc.id} document={doc} />)}</div></section> : null}

    <SupplierSettingsPanel />
    {editingProductId !== null ? <SupplierInfoEditor productId={editingProductId} onClose={() => setEditingProductId(null)} /> : null}
  </>;
}

function MarkupRulesView() {
  const queryClient = useQueryClient();
  const rulesQuery = useQuery({ queryKey: ["markup-rules"], queryFn: () => api.listMarkupRules({}) });
  const proposalsQuery = useQuery({ queryKey: ["price-proposals"], queryFn: () => api.listPriceProposals({ status: "all", limit: 50 }) });
  const [search, setSearch] = useState("");
  const deferred = useDeferredValue(search);
  const products = useQuery({ queryKey: ["markup-products", deferred], queryFn: () => api.listProducts({ query: deferred, mode: "all", limit: 50, offset: 0 }) });
  const [newVendor, setNewVendor] = useState("");
  const [newMarkup, setNewMarkup] = useState("25");
  const [message, setMessage] = useState("");
  const [draftMarkups, setDraftMarkups] = useState<Record<string, string>>({});
  const [overrideDrafts, setOverrideDrafts] = useState<Record<number, string>>({});
  const refresh = async () => { await queryClient.invalidateQueries({ queryKey: ["markup-rules"] }); await queryClient.invalidateQueries({ queryKey: ["price-proposals"] }); await queryClient.invalidateQueries({ queryKey: ["markup-products"] }); await queryClient.invalidateQueries({ queryKey: ["products"] }); };
  const saveRule = useMutation({ mutationFn: ({ vendor, markup }: { vendor: string; markup: string }) => api.saveMarkupRule({ vendor, markup_bps: Math.round((Number(markup) || 0) * 100) }), onSuccess: async (r) => { if (!r.ok) { setMessage(r.error ?? "Could not save rule."); return; } setMessage("Rule saved. Future cost changes will propose prices from it — nothing reprices until you approve a proposal below."); await refresh(); }, onError: () => setMessage("Could not save rule.") });
  const deleteRule = useMutation({ mutationFn: (id: number) => api.deleteMarkupRule({ id }), onSuccess: async () => { await refresh(); }, onError: () => setMessage("Could not remove rule.") });
  const decide = useMutation({ mutationFn: ({ id, decision }: { id: number; decision: "approved" | "rejected" }) => api.decidePriceProposal({ id, decision }), onSuccess: async (r) => { if (!r.ok) { setMessage(r.error ?? "Could not decide that proposal."); return; } setMessage(r.proposal?.status === "approved" ? `Approved — ${r.proposal.product_title} is now ${money(r.proposal.proposed_price_cents)}.` : "Proposal rejected — price stays as it was."); await refresh(); }, onError: () => setMessage("Could not decide that proposal.") });
  const setOverride = useMutation({ mutationFn: ({ id, bps }: { id: number; bps: number | null }) => api.setProductMarkupOverride({ product_id: id, markup_bps: bps }), onSuccess: async (r) => { if (!r.ok) { setMessage(r.error ?? "Could not save override."); return; } setMessage("Per-item override saved. If it changes the price at current cost, a proposal is waiting below for your approval."); await refresh(); }, onError: () => setMessage("Could not save override.") });
  const rules = rulesQuery.data?.rules ?? [];
  const vendors = rulesQuery.data?.vendors ?? [];
  const defaultRule = rules.find((r) => r.is_default);
  const vendorRules = rules.filter((r) => !r.is_default);
  const knownVendors = new Set(vendorRules.map((r) => r.vendor.toLowerCase()));
  const unruledVendors = vendors.filter((v) => v.vendor && !knownVendors.has(v.vendor.toLowerCase()));
  const pending = (proposalsQuery.data?.proposals ?? []).filter((p) => p.status === "pending");
  const decided = (proposalsQuery.data?.proposals ?? []).filter((p) => p.status !== "pending");
  const ruleInput = (key: string, currentBps: number) => draftMarkups[key] ?? (currentBps / 100).toFixed(2);
  return <>
    <section className="plain-command"><div><p>PRICING</p><h1>Markup rules</h1></div><span className="analytics-period">{pending.length} awaiting approval</span></section>
    <p className="field-intro">Auto markup off <b>last cost</b>: selling price = cost × (1 + markup %). Set a default, override it per manufacturer (vendor on the product), or override a single item. <b>When a cost changes</b> — in Products or when you approve a warehouse cost — the new price is <b>proposed below for your approval</b>. Nothing reprices on its own.</p>
    {message ? <p className="settings-success" role="status">{message}</p> : null}
    <section className="inventory-section"><div className="section-heading"><div><p>PROPOSED PRICES</p><h1>Awaiting your approval</h1></div><span>{pending.length}</span></div>
      {proposalsQuery.isPending ? <div className="loading-list"><span /></div> : pending.length === 0 ? <div className="empty-state"><h2>No price proposals waiting</h2><p>When a product&apos;s cost changes, the rule-based price will appear here first. Approve it to make it live, or reject it to keep the current price.</p></div> : <div className="proposal-list">{pending.map((p) => <article key={p.id} className="proposal-card"><div className="proposal-main"><strong>{p.product_title}</strong><small>{p.vendor || "No manufacturer"} · {p.rule_source} · markup {(p.markup_bps / 100).toFixed(2)}%</small><small>Cost {money(p.old_cost_cents)} → {money(p.new_cost_cents)} · Price {money(p.old_price_cents)} → <b>{money(p.proposed_price_cents)}</b> · {when(p.created_at)}</small></div><div className="proposal-actions"><button type="button" className="primary-button" disabled={decide.isPending} onClick={() => decide.mutate({ id: p.id, decision: "approved" })} aria-label={`Approve new price for ${p.product_title}`}>Approve {money(p.proposed_price_cents)}</button><button type="button" className="secondary-button" disabled={decide.isPending} onClick={() => decide.mutate({ id: p.id, decision: "rejected" })} aria-label={`Reject new price for ${p.product_title}`}>Keep {money(p.old_price_cents)}</button></div></article>)}</div>}
    </section>
    <section className="settings-panel"><div className="settings-copy"><h2>Default markup</h2><p>Applies to any product whose manufacturer has no rule of its own and no per-item override.</p></div>
      <div className="rule-row"><label><span>Default markup % off last cost</span><div className="money-input"><input aria-label="Default markup percent" type="number" step="0.01" value={ruleInput("__default__", defaultRule?.markup_bps ?? 0)} onChange={(e) => setDraftMarkups((c) => ({ ...c, __default__: e.target.value }))} /><b>%</b></div></label><button type="button" className="primary-button" disabled={saveRule.isPending} onClick={() => saveRule.mutate({ vendor: "", markup: ruleInput("__default__", defaultRule?.markup_bps ?? 0) })}>Save default</button>{defaultRule ? <span className="quiet-empty">Currently {(defaultRule.markup_bps / 100).toFixed(2)}%</span> : <span className="quiet-empty">No default set yet</span>}</div>
    </section>
    <section className="inventory-section"><div className="section-heading"><div><p>BY MANUFACTURER</p><h1>Manufacturer rules</h1></div><span>{vendorRules.length} rules · {vendors.length} manufacturers in catalog</span></div>
      <div className="rule-list">
        {vendorRules.map((r) => <div key={r.id} className="rule-card"><div><strong>{r.vendor}</strong><small>{r.product_count} products</small></div><label><span className="sr-only">Markup percent for {r.vendor}</span><div className="money-input"><input aria-label={`Markup percent for ${r.vendor}`} type="number" step="0.01" value={ruleInput(r.vendor, r.markup_bps)} onChange={(e) => setDraftMarkups((c) => ({ ...c, [r.vendor]: e.target.value }))} /><b>%</b></div></label><button type="button" className="primary-button" disabled={saveRule.isPending} onClick={() => saveRule.mutate({ vendor: r.vendor, markup: ruleInput(r.vendor, r.markup_bps) })}>Save</button><button type="button" className="link-button danger-link" onClick={() => deleteRule.mutate(r.id)} aria-label={`Remove markup rule for ${r.vendor}`}>Remove</button></div>)}
        {unruledVendors.map((v) => <div key={v.vendor} className="rule-card unruled"><div><strong>{v.vendor}</strong><small>{v.product_count} products · using {defaultRule ? "default rule" : "no rule"}</small></div><label><span className="sr-only">Markup percent for {v.vendor}</span><div className="money-input"><input aria-label={`Markup percent for ${v.vendor}`} type="number" step="0.01" value={draftMarkups[v.vendor] ?? newMarkup} onChange={(e) => setDraftMarkups((c) => ({ ...c, [v.vendor]: e.target.value }))} /><b>%</b></div></label><button type="button" className="primary-button" disabled={saveRule.isPending} onClick={() => saveRule.mutate({ vendor: v.vendor, markup: draftMarkups[v.vendor] ?? newMarkup })}>Add rule</button></div>)}
      </div>
      <form className="rule-add-form" onSubmit={(e) => { e.preventDefault(); if (newVendor.trim()) saveRule.mutate({ vendor: newVendor.trim(), markup: newMarkup }); }}><label><span>Manufacturer / vendor name</span><input aria-label="New manufacturer name" value={newVendor} onChange={(e) => setNewVendor(e.target.value)} placeholder="e.g. Indasa" /></label><label><span>Markup %</span><div className="money-input"><input aria-label="New manufacturer markup percent" type="number" step="0.01" value={newMarkup} onChange={(e) => setNewMarkup(e.target.value)} /><b>%</b></div></label><button type="submit" className="primary-button" disabled={!newVendor.trim() || saveRule.isPending}>Add manufacturer rule</button></form>
    </section>
    <section className="inventory-section"><div className="section-heading"><div><p>PER-ITEM OVERRIDE</p><h1>Override a single item</h1></div><span>Beats its manufacturer rule</span></div>
      <div className="customer-search"><SearchField value={search} onChange={setSearch} placeholder="Search product or manufacturer" label="Search products for markup override" /></div>
      <div className="rule-list">{products.data?.products.map((prod) => { const draft = overrideDrafts[prod.id] ?? (prod.markup_override_bps !== null ? (prod.markup_override_bps / 100).toFixed(2) : ""); return <div key={prod.id} className="rule-card product-rule"><div><strong>{prod.title}</strong><small>{prod.vendor || "No manufacturer"} · Cost {money(prod.cost_cents)} · Price {money(prod.price_cents)}{prod.markup_override_bps !== null ? ` · Override ${(prod.markup_override_bps / 100).toFixed(2)}%` : ""}</small></div><label><span className="sr-only">Override markup percent for {prod.title}</span><div className="money-input"><input aria-label={`Override markup percent for ${prod.title}`} type="number" step="0.01" value={draft} onChange={(e) => setOverrideDrafts((c) => ({ ...c, [prod.id]: e.target.value }))} placeholder="—" /><b>%</b></div></label><button type="button" className="primary-button" disabled={setOverride.isPending || draft === ""} onClick={() => setOverride.mutate({ id: prod.id, bps: Math.round((Number(draft) || 0) * 100) })}>Set override</button>{prod.markup_override_bps !== null ? <button type="button" className="link-button" onClick={() => setOverride.mutate({ id: prod.id, bps: null })} aria-label={`Clear override for ${prod.title}`}>Clear</button> : null}</div>; })}{products.data?.products.length === 0 ? <p className="quiet-empty">No products match.</p> : null}</div>
    </section>
    {decided.length ? <section className="inventory-section"><div className="section-heading"><div><p>HISTORY</p><h1>Decided proposals</h1></div><span>{decided.length}</span></div><div className="proposal-list">{decided.slice(0, 15).map((p) => <article key={p.id} className="proposal-card decided"><div className="proposal-main"><strong>{p.product_title}</strong><small>{p.status === "approved" ? "Approved" : "Rejected"} · {money(p.old_price_cents)} → {money(p.proposed_price_cents)} · cost {money(p.new_cost_cents)} · {p.decided_at ? when(p.decided_at) : ""}</small></div></article>)}</div></section> : null}
  </>;
}

function SalesTeamView() {
  const queryClient = useQueryClient();
  const team = useQuery({ queryKey: ["sales-team"], queryFn: () => api.listSalesTeam({}) });
  const [newName, setNewName] = useState("");
  const [newRate, setNewRate] = useState("10");
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [message, setMessage] = useState("");
  const refresh = async () => { await queryClient.invalidateQueries({ queryKey: ["sales-team"] }); await queryClient.invalidateQueries({ queryKey: ["analytics-salespeople"] }); };
  const add = useMutation({ mutationFn: () => api.createSalesTeamMember({ name: newName.trim(), commission_bps: Math.round((Number(newRate) || 0) * 100) }), onSuccess: async (r) => { if (!r.ok) { setMessage(r.error ?? "Could not add that person."); return; } setMessage(`${r.member?.name} added at ${(r.member?.commission_bps ?? 0) / 100}% commission. They now appear at checkout and in field orders.`); setNewName(""); await refresh(); }, onError: () => setMessage("Could not add that person.") });
  const update = useMutation({ mutationFn: ({ id, rate, active }: { id: number; rate: string; active: boolean }) => api.updateSalesTeamMember({ id, commission_bps: Math.round((Number(rate) || 0) * 100), active }), onSuccess: async (r) => { if (!r.ok) { setMessage(r.error ?? "Could not save."); return; } setMessage(`Saved ${r.member?.name} at ${((r.member?.commission_bps ?? 0) / 100).toFixed(2)}%. Analytics commissions now use this rate.`); await refresh(); }, onError: () => setMessage("Could not save.") });
  return <>
    <section className="plain-command"><div><p>TEAM</p><h1>Sales team</h1></div><span className="analytics-period">{team.data?.members.length ?? 0} members</span></section>
    <p className="field-intro">Everyone who can be picked as the salesperson at checkout or on a field order, and the commission rate Analytics pays them on their net sales (before tax). Change a rate here and Analytics uses it right away.</p>
    {message ? <p className="settings-success" role="status">{message}</p> : null}
    <section className="inventory-section"><div className="section-heading"><div><p>MEMBERS</p><h1>Team &amp; commission rates</h1></div></div>
      {team.isPending ? <div className="loading-list"><span /></div> : <div className="team-list">{team.data?.members.map((m) => { const draft = drafts[m.id] ?? (m.commission_bps / 100).toFixed(2); return <article key={m.id} className={`team-card ${m.active ? "" : "inactive"}`}><span className="customer-avatar">{m.name.slice(0, 1).toUpperCase()}</span><div className="team-main"><strong>{m.name}</strong><small>{m.active ? "Active — appears at checkout & field orders" : "Inactive — hidden from pickers, history kept"}</small></div><label><span>Commission %</span><div className="money-input"><input aria-label={`Commission percent for ${m.name}`} type="number" step="0.01" min="0" max="100" value={draft} onChange={(e) => setDrafts((c) => ({ ...c, [m.id]: e.target.value }))} /><b>%</b></div></label><button type="button" className="primary-button" disabled={update.isPending} onClick={() => update.mutate({ id: m.id, rate: draft, active: m.active })}>Save rate</button><button type="button" className="link-button" onClick={() => update.mutate({ id: m.id, rate: draft, active: !m.active })} aria-label={`${m.active ? "Deactivate" : "Reactivate"} ${m.name}`}>{m.active ? "Deactivate" : "Reactivate"}</button></article>; })}</div>}
    </section>
    <section className="settings-panel"><div className="settings-copy"><h2>Add a team member</h2><p>New salespeople appear at checkout and in field orders as soon as they&apos;re added.</p></div>
      <form onSubmit={(e) => { e.preventDefault(); if (newName.trim()) add.mutate(); }}><div className="form-grid"><label><span>Name</span><input aria-label="New team member name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Jordan" /></label><label><span>Commission %</span><div className="money-input"><input aria-label="New team member commission percent" type="number" step="0.01" min="0" max="100" value={newRate} onChange={(e) => setNewRate(e.target.value)} /><b>%</b></div></label></div>{message && !team.data ? null : null}<div className="form-actions"><button type="submit" className="primary-button" disabled={!newName.trim() || add.isPending}>{add.isPending ? "Adding…" : "Add team member"}</button></div></form>
    </section>
  </>;
}

function ReturnsSummaryView() {
  const [preset, setPreset] = useState<AnalyticsPreset>("all");
  const [range, setRange] = useState(() => presetRange("all"));
  const startDate = range.start || null;
  const endDate = range.end || null;
  const summary = useQuery({ queryKey: ["returns-summary", startDate, endDate], queryFn: () => api.getReturnsSummary({ start_date: startDate, end_date: endDate }) });
  const pickPreset = (value: AnalyticsPreset) => { setPreset(value); if (value !== "custom") setRange(presetRange(value)); };
  const setManual = (key: "start" | "end", value: string) => { setPreset("custom"); setRange((c) => ({ ...c, [key]: value })); };
  const data = summary.data;
  const printSummary = () => { if (!data) return; const lines = [`RETURNS SUMMARY — ${prettyRange(range.start, range.end)}`, `${data.total_returns} returns · ${data.total_units} units · ${money(data.total_cents)} total`, `Refunded ${money(data.refunded_cents)} · On-account credit ${money(data.credited_cents)}`, "", "BY REFUND METHOD", ...data.by_method.map((m) => `${refundMethodLabel(m.method)}: ${m.count} returns · ${money(m.total_cents)}`), "", "TOP REASONS", ...data.by_reason.slice(0, 10).map((r) => `${r.reason}: ${r.units} units · ${money(r.total_cents)}`)]; openPdfInTab(buildPdfBlob("RIMA returns summary", lines.join("\n"))); };
  return <>
    <section className="plain-command"><div><p>RETURNS</p><h1>Returns summary</h1></div><button type="button" className="secondary-button print-report-button" onClick={printSummary} disabled={!data}><PrinterIcon /> Print summary</button></section>
    <section className="analytics-filters" aria-label="Returns date range"><div className="preset-chips" role="group" aria-label="Returns date presets">{([["month", "This month"], ["lastMonth", "Last month"], ["last30", "Last 30 days"], ["year", "This year"], ["all", "All time"], ["custom", "Custom"]] as Array<[AnalyticsPreset, string]>).map(([v, l]) => <button key={v} type="button" className={preset === v ? "active" : ""} onClick={() => pickPreset(v)} aria-label={`Returns range: ${l}`}>{l}</button>)}</div><div className="date-inputs"><label><span>From</span><input aria-label="Returns start date" type="date" value={range.start} onChange={(e) => setManual("start", e.target.value)} /></label><label><span>To</span><input aria-label="Returns end date" type="date" value={range.end} onChange={(e) => setManual("end", e.target.value)} /></label></div></section>
    {summary.isPending ? <div className="loading-list"><span /><span /></div> : !data || data.total_returns === 0 ? <div className="empty-state"><h2>No returns in this period</h2><p>Returns recorded on invoices will summarize here — items, reasons, refund methods, and totals.</p></div> : <>
      <div className="analytics-totals" aria-label="Returns totals"><div><span>Returns</span><strong>{data.total_returns}</strong></div><div><span>Units returned</span><strong>{data.total_units}</strong></div><div><span>Total returned</span><strong>{money(data.total_cents)}</strong></div><div><span>Refunded (cash/card)</span><strong>{money(data.refunded_cents)}</strong></div><div><span>On-account credit</span><strong>{money(data.credited_cents)}</strong></div></div>
      <section className="inventory-section"><div className="section-heading"><div><p>BY REFUND METHOD</p><h1>How customers were made whole</h1></div></div><div className="team-list">{data.by_method.map((m) => <div key={m.method} className="rule-card"><div><strong>{refundMethodLabel(m.method)}</strong><small>{m.count} return{m.count === 1 ? "" : "s"}</small></div><b>{money(m.total_cents)}</b></div>)}</div></section>
      <section className="inventory-section"><div className="section-heading"><div><p>BY REASON</p><h1>Why items came back</h1></div></div><div className="team-list">{data.by_reason.map((r) => <div key={r.reason} className="rule-card"><div><strong>{r.reason}</strong><small>{r.count} line{r.count === 1 ? "" : "s"} · {r.units} units</small></div><b>{money(r.total_cents)}</b></div>)}</div></section>
      <section className="inventory-section"><div className="section-heading"><div><p>BY ITEM</p><h1>Most-returned items</h1></div></div><div className="team-list">{data.by_item.map((it) => <div key={it.product_id} className="rule-card"><div><strong>{it.product_title}</strong><small>{it.units} units · {it.return_count} return line{it.return_count === 1 ? "" : "s"}</small></div><b>{money(it.total_cents)}</b></div>)}</div></section>
      <section className="inventory-section"><div className="section-heading"><div><p>ALL RETURNS</p><h1>Every return in this period</h1></div><span>{data.returns.length}</span></div><div className="return-history">{data.returns.map((ret) => <article key={ret.id} className="return-record"><div className="return-record-head"><span><ReturnIcon /><strong>{ret.customer_name}{ret.invoice_number !== null ? ` · Invoice #${ret.invoice_number}` : ""}</strong></span><span>{when(ret.created_at)}</span><b>-{money(ret.total_cents)}</b></div><ul>{ret.items.map((item, i) => <li key={i}><span>{item.quantity} × {item.product_title} — <em>{item.reason}</em></span><b>{money(item.line_total_cents)}</b></li>)}</ul><small>{refundMethodLabel(ret.refund_method)}{ret.field_order_id ? " · From a field order — also shown on that field order" : ""}{ret.refunded_cents > 0 ? ` · ${money(ret.refunded_cents)} refunded` : ""}{ret.credited_cents > 0 ? ` · ${money(ret.credited_cents)} credited` : ""}</small></article>)}</div></section>
    </>}
  </>;
}

type SalesOrderRow = ApiResponse<typeof api, "listSalesOrders">["orders"][number];
type MonthlyStatement = ApiResponse<typeof api, "getMonthlyStatement">;

function monthlyStatementText(data: MonthlyStatement): string {
  const customer = data.customer;
  const name = customer ? (customer.business_name || customer.name) : "Customer";
  const lines = data.invoices.map((o) => `${o.invoice_number !== null ? `Invoice #${o.invoice_number}` : "Invoice"} · ${when(o.created_at)} · Total ${money(o.total_cents)} · Paid ${money(o.paid_cents)} · ${money(o.balance_cents)} DUE`);
  return ["RIMA SUPPLY COMPANY", `STATEMENT — ${data.period_label.toUpperCase()}`, `Customer: ${name}`, customer?.email ? `Email: ${customer.email}` : "", customer?.phone ? `Phone: ${customer.phone}` : "", "", "DUE INVOICES FOR THIS PERIOD (unpaid / partially paid)", ...(lines.length ? lines : ["No due invoices for this period."]), "", `Total due for ${data.period_label}: ${money(data.total_due_cents)}`, `Total invoiced in period: ${money(data.total_invoiced_cents)}`, "", "Please remit payment for the balance shown. Thank you!"].filter((l) => l !== "").join("\n");
}

function OrdersView({ onOpenCustomer, onOpenField }: { onOpenCustomer: (id: number) => void; onOpenField: () => void }) {
  const [search, setSearch] = useState("");
  const deferred = useDeferredValue(search);
  const [status, setStatus] = useState<"all" | "paid" | "due" | "draft">("all");
  const orders = useQuery({ queryKey: ["sales-orders", deferred, status], queryFn: () => api.listSalesOrders({ query: deferred, status, limit: 100 }) });
  const rows = orders.data?.orders ?? [];
  const badge = (row: SalesOrderRow) => row.display_status === "paid" ? "Paid · Completed" : row.display_status === "draft" ? "Draft" : row.balance_cents > 0 && row.paid_cents > 0 ? "Partially paid · Due" : "Unpaid · Due";
  return <>
    <section className="plain-command"><div><p>ORDERS</p><h1>Orders</h1></div><span className="analytics-period">{orders.data ? `${orders.data.total} orders` : ""}</span></section>
    <p className="field-intro">Every order in one list — like Shopify. <b>Paid · Completed</b> means paid in full, <b>Due</b> means money is still owed, and <b>Draft</b> means a field order that hasn&apos;t been finalized yet. Tap an invoice to open the customer&apos;s account, print, email, or text it.</p>
    <div className="preset-chips" role="group" aria-label="Order status filter" style={{ marginTop: 14 }}>
      {([["all", `All (${orders.data?.total ?? 0})`], ["paid", `Paid (${orders.data?.paid_count ?? 0})`], ["due", `Due (${orders.data?.due_count ?? 0})`], ["draft", `Draft (${orders.data?.draft_count ?? 0})`]] as Array<["all" | "paid" | "due" | "draft", string]>).map(([value, label]) => <button key={value} type="button" className={status === value ? "active" : ""} onClick={() => setStatus(value)} aria-label={`Show ${label} orders`}>{label}</button>)}
    </div>
    <div className="customer-search"><SearchField value={search} onChange={setSearch} placeholder="Search customer or invoice #" label="Search orders" /></div>
    <section className="inventory-section">
      <div className="section-heading"><div><p>{status === "all" ? "ALL ORDERS" : status.toUpperCase()}</p><h1>{search ? `Matches for “${search}”` : "Recent orders"}</h1></div><span>{rows.length} shown</span></div>
      {orders.isPending ? <div className="loading-list"><span /><span /></div> : rows.length === 0 ? <div className="empty-state"><h2>No orders found</h2><p>{search ? "Try another customer name or invoice number." : "Completed checkouts and field-order drafts will show up here."}</p></div> : <div className="customer-list orders-list">{rows.map((row) => <button key={`${row.kind}-${row.id}`} type="button" onClick={() => { if (row.kind === "draft") onOpenField(); else if (row.customer_id !== null) onOpenCustomer(row.customer_id); }} aria-label={`Open ${row.invoice_number !== null ? `invoice ${row.invoice_number}` : "draft order"} for ${row.customer_name}`}>
        <span className="customer-copy"><strong>{row.invoice_number !== null ? `Invoice #${row.invoice_number}` : "Draft — no invoice # yet"}</strong><small>{row.customer_name} · {when(row.created_at)} · {row.item_count} item{row.item_count === 1 ? "" : "s"} · Sold by {row.salesperson}</small></span>
        <span className="balance-label"><b>{money(row.total_cents)}</b><small>{row.balance_cents > 0 ? `${money(row.balance_cents)} due` : "Paid in full"}</small></span>
        <span className={`order-status-badge status-${row.display_status}`}>{badge(row)}</span>
        <ChevronIcon />
      </button>)}</div>}
    </section>
  </>;
}

function StatementsView({ onOpenCustomer }: { onOpenCustomer: (id: number) => void }) {
  const now = new Date();
  const [customerSearch, setCustomerSearch] = useState("");
  const deferred = useDeferredValue(customerSearch);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [generated, setGenerated] = useState<MonthlyStatement | null>(null);
  const [error, setError] = useState("");
  const customers = useQuery({ queryKey: ["statement-customers", deferred], queryFn: () => api.listCustomers({ query: deferred, limit: 20 }), enabled: !customer });
  const generate = useMutation({ mutationFn: () => api.getMonthlyStatement({ customer_id: customer?.id ?? 0, year, month }), onSuccess: (result) => { setGenerated(result); setError(result.customer ? "" : "Customer not found."); }, onError: () => setError("Could not generate that statement. Try again.") });
  const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const years = [now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];
  const stmtCustomer = generated?.customer ?? customer;
  const stmtEmail = stmtCustomer?.ap_email || stmtCustomer?.email || "";
  const stmtPhone = stmtCustomer?.ap_phone || stmtCustomer?.phone || "";
  const stmtData = generated ? statementDataForMonthly(generated) : null;
  return <>
    <section className="plain-command"><div><p>STATEMENTS</p><h1>Statement generator</h1></div></section>
    <p className="field-intro">Pick a customer and a month, and this builds a statement of just their <b>due invoices</b> — unpaid and partially paid — from that period. Then print it as a PDF, email it in Gmail, or text it.</p>
    <section className="checkout-step field-step">
      <div className="step-title"><span>1</span><div><h2>Pick the customer</h2><p>Search by business, name, phone, or email.</p></div></div>
      {customer ? <div className="selected-customer"><UserIcon /><span><strong>{customer.business_name || customer.name}</strong><small>{customer.email || "No email"} · {customer.phone || "No phone"} · Balance {money(customer.balance_cents)}</small></span><button type="button" onClick={() => { setCustomer(null); setGenerated(null); }}>Change</button></div> : <><SearchField value={customerSearch} onChange={setCustomerSearch} placeholder="Search customers" label="Search customers for statement" /><div className="picker-results field-customer-list">{(customers.data?.customers ?? []).map((item) => <button key={item.id} type="button" onClick={() => { setCustomer(item); setCustomerSearch(""); setGenerated(null); }}><span><strong>{item.business_name || item.name}</strong><small>{item.business_name ? `${item.name} · ` : ""}{item.phone || item.email || "No contact details"}</small></span>{item.balance_cents > 0 ? <b>{money(item.balance_cents)} due</b> : <b className="paid-mark">No balance</b>}</button>)}{customers.isPending ? <p className="quiet-empty field-list-note">Loading customers…</p> : null}</div></>}
    </section>
    <section className="checkout-step field-step">
      <div className="step-title"><span>2</span><div><h2>Pick the month</h2><p>Only invoices dated in this month count toward the statement.</p></div></div>
      <div className="form-grid">
        <label><span>Month</span><select aria-label="Statement month" value={month} onChange={(e) => setMonth(Number(e.target.value))}>{monthNames.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}</select></label>
        <label><span>Year</span><select aria-label="Statement year" value={year} onChange={(e) => setYear(Number(e.target.value))}>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select></label>
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="form-actions"><button type="button" className="primary-button" disabled={!customer || generate.isPending} onClick={() => generate.mutate()}>{generate.isPending ? "Building…" : `Generate statement · ${monthNames[month - 1]} ${year}`}</button>{customer ? <button type="button" className="secondary-button" onClick={() => onOpenCustomer(customer.id)}>Open account</button> : null}</div>
    </section>
    {generated && generated.customer ? <section className="inventory-section" aria-label="Generated statement">
      <div className="section-heading"><div><p>STATEMENT · {generated.period_label.toUpperCase()}</p><h1>{generated.customer.business_name || generated.customer.name}</h1></div><span>{money(generated.total_due_cents)} due</span></div>
      <div className="analytics-totals"><div><span>Due in {generated.period_label}</span><strong>{money(generated.total_due_cents)}</strong></div><div><span>Invoiced in period</span><strong>{money(generated.total_invoiced_cents)}</strong></div><div><span>Due invoices</span><strong>{generated.invoices.length}</strong></div></div>
      {generated.invoices.length === 0 ? <div className="empty-state"><h2>No due invoices in {generated.period_label}</h2><p>This customer has no unpaid or partially paid invoices dated in that month. Try another month, or open their account to see everything they owe.</p></div> : stmtData ? <StatementDocument data={stmtData} /> : null}
      <div className="statement-delivery" style={{ marginTop: 16 }}><div><strong>Send this statement</strong><span>Print / PDF, Gmail, or text — addressed to {generated.customer.business_name || generated.customer.name}.</span></div><DeliveryActions subject={`RIMA Statement — ${generated.period_label} — ${generated.customer.business_name || generated.customer.name}`} body={monthlyStatementText(generated)} email={stmtEmail} phone={stmtPhone} filename={`RIMA-statement-${year}-${String(month).padStart(2, "0")}-${generated.customer.id}.pdf`} label={`${generated.period_label} statement`} statementData={stmtData} /></div>
    </section> : null}
  </>;
}

/* ---------- Branded deposit report (same design language as the invoice & statement) ---------- */
type DepositMethod = "cash" | "card" | "check";
const DEPOSIT_METHOD_LABEL: Record<DepositMethod, string> = { cash: "Cash", card: "Card", check: "Check" };

type DepositPdfEntry = { timeLabel: string; customerName: string; invoiceNumber: number | null; method: DepositMethod; amountCents: number };
type DepositPdfDay = { date: string; label: string; totalCents: number; cashCents: number; cardCents: number; checkCents: number; count: number; entries: DepositPdfEntry[] };
type DepositPdfData = {
  periodLabel: string;
  generatedLabel: string;
  generatedShort: string;
  totalCents: number;
  paymentsCents: number;
  refundsCents: number;
  entryCount: number;
  paymentCount: number;
  refundCount: number;
  dayCount: number;
  byMethod: Array<{ method: DepositMethod; label: string; totalCents: number; paymentsCents: number; refundsCents: number; count: number }>;
  days: DepositPdfDay[];
};

function depositDayLabel(date: string): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(new Date(`${date}T12:00:00`));
}
function depositTimeLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}
function signedMoney(cents: number): string { return cents < 0 ? `-${money(-cents)}` : money(cents); }

function depositPdfData(report: DepositReport): DepositPdfData {
  const nowIso = new Date().toISOString();
  return {
    periodLabel: report.period_label,
    generatedLabel: when(nowIso),
    generatedShort: shortDate(nowIso),
    totalCents: report.totals.total_cents,
    paymentsCents: report.totals.payments_cents,
    refundsCents: report.totals.refunds_cents,
    entryCount: report.totals.entry_count,
    paymentCount: report.totals.payment_count,
    refundCount: report.totals.refund_count,
    dayCount: report.totals.day_count,
    byMethod: report.by_method.map((row) => ({ method: row.method, label: DEPOSIT_METHOD_LABEL[row.method], totalCents: row.total_cents, paymentsCents: row.payments_cents, refundsCents: row.refunds_cents, count: row.count })),
    days: report.days.map((day) => ({
      date: day.date,
      label: depositDayLabel(day.date),
      totalCents: day.total_cents,
      cashCents: day.cash_cents,
      cardCents: day.card_cents,
      checkCents: day.check_cents,
      count: day.entry_count,
      entries: day.entries.map((entry) => ({ timeLabel: depositTimeLabel(entry.created_at), customerName: entry.customer_name, invoiceNumber: entry.invoice_number, method: entry.method, amountCents: entry.amount_cents })),
    })),
  };
}

function depositReportText(report: DepositReport): string {
  const lines: string[] = [
    "RIMA SUPPLY COMPANY",
    `DEPOSIT REPORT — ${report.period_label.toUpperCase()}`,
    "",
    "BY PAYMENT METHOD",
    ...report.by_method.map((row) => `${DEPOSIT_METHOD_LABEL[row.method]}: ${money(row.total_cents)} (${row.count} entr${row.count === 1 ? "y" : "ies"}${row.refunds_cents > 0 ? `, incl. ${money(row.refunds_cents)} refunded` : ""})`),
    "",
    `GRAND TOTAL RECEIVED: ${money(report.totals.total_cents)}`,
    report.totals.refunds_cents > 0 ? `Payments in: ${money(report.totals.payments_cents)} · Refunds out: ${money(report.totals.refunds_cents)}` : `${report.totals.payment_count} payment${report.totals.payment_count === 1 ? "" : "s"} across ${report.totals.day_count} day${report.totals.day_count === 1 ? "" : "s"}`,
    "",
    "DAILY BREAKDOWN",
  ];
  for (const day of report.days) {
    lines.push("", `${depositDayLabel(day.date)} — ${money(day.total_cents)} (Cash ${money(day.cash_cents)} · Card ${money(day.card_cents)} · Check ${money(day.check_cents)})`);
    for (const entry of day.entries) {
      lines.push(`  ${depositTimeLabel(entry.created_at)} · ${entry.customer_name}${entry.invoice_number !== null ? ` · Invoice #${entry.invoice_number}` : ""} · ${DEPOSIT_METHOD_LABEL[entry.method]} · ${signedMoney(entry.amount_cents)}${entry.amount_cents < 0 ? " (refund)" : ""}`);
    }
  }
  if (report.days.length === 0) lines.push("", "No payments were received in this period.");
  lines.push("", "Thank you! — RIMA Supply Company");
  return lines.join("\n");
}

function DepositDocument({ data }: { data: DepositPdfData }) {
  return <article className="invoice-doc deposit-doc" aria-label={`Deposit report for ${data.periodLabel}`}>
    <header className="invoice-doc-head">
      <img src={rimaLogo} alt="RIMA Supply Company" />
      <div className="invoice-doc-title">
        <span>DEPOSIT REPORT</span>
        <strong>{data.periodLabel}</strong>
        <small>Generated {data.generatedLabel}</small>
      </div>
    </header>
    <div className="invoice-doc-meta">
      <section className="invoice-doc-billto" aria-label="Report summary">
        <h3>Payments received</h3>
        <strong>{money(data.totalCents)} total deposits</strong>
        <span>{data.paymentCount} payment{data.paymentCount === 1 ? "" : "s"} across {data.dayCount} day{data.dayCount === 1 ? "" : "s"}{data.refundCount > 0 ? ` · ${data.refundCount} refund${data.refundCount === 1 ? "" : "s"} totaling ${money(data.refundsCents)} already taken out` : ""}.</span>
        <span>Every cash, card, and check payment recorded at checkout, on account, or as a refund in this period.</span>
      </section>
      <dl className="invoice-doc-details">
        <div><dt>Period</dt><dd>{data.periodLabel}</dd></div>
        <div><dt>Generated</dt><dd>{data.generatedShort}</dd></div>
        <div><dt>Entries</dt><dd>{data.entryCount}</dd></div>
        <div><dt>Grand total</dt><dd>{money(data.totalCents)}</dd></div>
      </dl>
    </div>
    <table className="invoice-doc-table deposit-method-table">
      <thead><tr><th scope="col">Payment method</th><th scope="col" className="num">Entries</th><th scope="col" className="num">Received</th><th scope="col" className="num">Refunded</th><th scope="col" className="num">Net total</th></tr></thead>
      <tbody>
        {data.byMethod.map((row) => <tr key={row.method}>
          <td className="amount">{row.label}</td>
          <td className="num">{row.count}</td>
          <td className="num">{money(row.paymentsCents)}</td>
          <td className="num">{row.refundsCents > 0 ? `-${money(row.refundsCents)}` : "—"}</td>
          <td className="num amount">{signedMoney(row.totalCents)}</td>
        </tr>)}
      </tbody>
    </table>
    {data.days.map((day) => <section key={day.date} className="deposit-day" aria-label={`Payments on ${day.label}`}>
      <div className="deposit-day-head"><strong>{day.label}</strong><span>Cash {money(day.cashCents)} · Card {money(day.cardCents)} · Check {money(day.checkCents)}</span><b>{signedMoney(day.totalCents)}</b></div>
      <table className="invoice-doc-table deposit-entry-table">
        <thead><tr><th scope="col">Time</th><th scope="col">Customer</th><th scope="col">Invoice</th><th scope="col">Method</th><th scope="col" className="num">Amount</th></tr></thead>
        <tbody>
          {day.entries.map((entry, index) => <tr key={index}>
            <td>{entry.timeLabel}</td>
            <td>{entry.customerName}{entry.amountCents < 0 ? <em className="invoice-doc-returned">Refund</em> : null}</td>
            <td>{entry.invoiceNumber !== null ? `#${entry.invoiceNumber}` : "—"}</td>
            <td>{DEPOSIT_METHOD_LABEL[entry.method]}</td>
            <td className="num amount">{signedMoney(entry.amountCents)}</td>
          </tr>)}
        </tbody>
      </table>
      <p className="deposit-day-subtotal">Day subtotal — {day.count} entr{day.count === 1 ? "y" : "ies"} · <b>{signedMoney(day.totalCents)}</b></p>
    </section>)}
    {data.days.length === 0 ? <p className="deposit-empty">No payments were received in this period.</p> : null}
    <div className="invoice-doc-totals">
      <div className="invoice-doc-note">
        <strong>Deposit summary</strong>
        <span>Match this grand total against the bank deposit for {data.periodLabel}. Refunds are already subtracted.</span>
      </div>
      <dl>
        <div><dt>Payments received</dt><dd>{money(data.paymentsCents)}</dd></div>
        {data.refundsCents > 0 ? <div><dt>Refunds</dt><dd>-{money(data.refundsCents)}</dd></div> : null}
        <div><dt>Cash</dt><dd>{signedMoney(data.byMethod.find((row) => row.method === "cash")?.totalCents ?? 0)}</dd></div>
        <div><dt>Card</dt><dd>{signedMoney(data.byMethod.find((row) => row.method === "card")?.totalCents ?? 0)}</dd></div>
        <div><dt>Check</dt><dd>{signedMoney(data.byMethod.find((row) => row.method === "check")?.totalCents ?? 0)}</dd></div>
        <div className="invoice-doc-grand"><dt>Grand total</dt><dd>{signedMoney(data.totalCents)}</dd></div>
      </dl>
    </div>
  </article>;
}

async function buildDepositPdfBlob(data: DepositPdfData): Promise<Blob> {
  const logo = await loadLogoBytes();
  const PW = 612; const PH = 792; const M = 42; const R = PW - M; const W = R - M;
  const pages: string[][] = [];
  let ops: string[] = [];
  let y = PH;
  const drawText = (text: string, x: number, ty: number, opts: { font: "F1" | "F2" | "F3"; size: number; color: PdfColor; align?: "left" | "right" | "center" }) => {
    const safe = pdfSafeText(text);
    if (!safe) return;
    let tx = x;
    const width = pdfTextWidth(safe, opts.size, opts.font === "F2");
    if (opts.align === "right") tx = x - width;
    else if (opts.align === "center") tx = x - width / 2;
    ops.push(`BT /${opts.font} ${opts.size} Tf ${colorOp(opts.color)} 1 0 0 1 ${tx.toFixed(2)} ${ty.toFixed(2)} Tm (${pdfEscape(safe)}) Tj ET`);
  };
  const drawRect = (x: number, ry: number, w: number, h: number, color: PdfColor) => { ops.push(colorOp(color), `${x.toFixed(2)} ${ry.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`); };
  const drawLine = (x1: number, y1: number, x2: number, y2: number, color: PdfColor, width = 0.7) => { ops.push(colorOp(color, true), `${width} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`); };
  const startPage = (continued: boolean) => {
    ops = [];
    pages.push(ops);
    if (!continued) {
      ops.push(colorOp(PDF_BLACK), `0 ${PH - 104} ${PW} 104 re f`);
      ops.push(colorOp(PDF_YELLOW), `0 ${PH - 108} ${PW} 4 re f`);
      if (logo) {
        const logoW = 122; const logoH = (logoW * 766) / 1078;
        ops.push(`q ${logoW.toFixed(2)} 0 0 ${logoH.toFixed(2)} ${M} ${(PH - 10 - logoH).toFixed(2)} cm /Im1 Do Q`);
      } else {
        drawText("RIMA", M, PH - 48, { font: "F2", size: 30, color: PDF_YELLOW });
        drawText("SUPPLY COMPANY", M + 1, PH - 66, { font: "F2", size: 10, color: PDF_WHITE });
      }
      drawText("DEPOSIT REPORT", R, PH - 42, { font: "F2", size: 24, color: PDF_WHITE, align: "right" });
      drawText(data.periodLabel, R, PH - 64, { font: "F2", size: 12, color: PDF_YELLOW, align: "right" });
      drawText(`Generated ${data.generatedLabel}`, R, PH - 81, { font: "F1", size: 9.5, color: [0.82, 0.83, 0.8], align: "right" });
      y = PH - 132;
    } else {
      ops.push(colorOp(PDF_BLACK), `0 ${PH - 40} ${PW} 40 re f`);
      ops.push(colorOp(PDF_YELLOW), `0 ${PH - 43} ${PW} 3 re f`);
      drawText("RIMA SUPPLY COMPANY", M, PH - 26, { font: "F2", size: 11, color: PDF_WHITE });
      drawText(`Deposit report - ${data.periodLabel} (continued)`, R, PH - 26, { font: "F1", size: 9, color: [0.82, 0.83, 0.8], align: "right" });
      y = PH - 62;
    }
  };
  const ensureSpace = (needed: number) => { if (y - needed < 58) startPage(true); };
  startPage(false);

  // Summary block (left) + details box (right).
  const topY = y;
  drawText("PAYMENTS RECEIVED", M, topY, { font: "F2", size: 7.5, color: PDF_YELLOW_DARK });
  let by = topY - 17;
  for (const line of wrapPdfText(`${pdfMoney(data.totalCents)} total deposits`, 288, 12.5, true)) { drawText(line, M, by, { font: "F2", size: 12.5, color: PDF_DARK }); by -= 15; }
  const summaryLines = [
    `${data.paymentCount} payment${data.paymentCount === 1 ? "" : "s"} across ${data.dayCount} day${data.dayCount === 1 ? "" : "s"}.`,
    ...(data.refundCount > 0 ? [`${data.refundCount} refund${data.refundCount === 1 ? "" : "s"} totaling ${pdfMoney(data.refundsCents)} already taken out.`] : []),
    "Cash, card, and check payments recorded at",
    "checkout, on account, or as refunds.",
  ];
  for (const line of summaryLines) { drawText(line, M, by, { font: "F1", size: 9, color: PDF_GREY }); by -= 12.5; }
  const summaryBottom = by + 4;
  const boxX = 372; const boxW = R - boxX;
  const boxRows: Array<[string, string]> = [
    ["Period", data.periodLabel.length > 26 ? `${data.periodLabel.slice(0, 25)}...` : data.periodLabel],
    ["Generated", data.generatedShort],
    ["Entries", String(data.entryCount)],
    ["Grand total", pdfMoney(data.totalCents)],
  ];
  const boxH = boxRows.length * 15.5 + 13;
  drawRect(boxX, topY + 6 - boxH, boxW, boxH, PDF_BOX);
  boxRows.forEach(([label, value], i) => {
    const ry = topY - 8 - i * 15.5;
    drawText(label.toUpperCase(), boxX + 10, ry, { font: "F2", size: 7, color: PDF_GREY });
    drawText(value, R - 10, ry, { font: "F2", size: 9, color: PDF_DARK, align: "right" });
  });
  y = Math.min(summaryBottom, topY + 6 - boxH) - 16;

  // By-method table.
  const mX = M + 10; const countC = M + 218; const recvR = M + 330; const refR = M + 424; const netR = R - 10;
  const drawMethodHeader = () => {
    ensureSpace(30);
    drawRect(M, y - 22, W, 22, PDF_DARK);
    drawText("PAYMENT METHOD", mX, y - 15, { font: "F2", size: 8, color: PDF_WHITE });
    drawText("ENTRIES", countC, y - 15, { font: "F2", size: 8, color: PDF_WHITE, align: "center" });
    drawText("RECEIVED", recvR, y - 15, { font: "F2", size: 8, color: PDF_WHITE, align: "right" });
    drawText("REFUNDED", refR, y - 15, { font: "F2", size: 8, color: PDF_WHITE, align: "right" });
    drawText("NET TOTAL", netR, y - 15, { font: "F2", size: 8, color: PDF_WHITE, align: "right" });
    y -= 22;
  };
  drawMethodHeader();
  data.byMethod.forEach((row, index) => {
    const rowH = 21;
    if (y - rowH < 58) { startPage(true); drawMethodHeader(); }
    const rowTop = y;
    if (index % 2 === 1) drawRect(M, rowTop - rowH, W, rowH, PDF_SHADE);
    const midY = rowTop - 14;
    drawText(row.label, mX, midY, { font: "F2", size: 9.5, color: PDF_DARK });
    drawText(String(row.count), countC, midY, { font: "F1", size: 9.5, color: PDF_DARK, align: "center" });
    drawText(pdfMoney(row.paymentsCents), recvR, midY, { font: "F1", size: 9.5, color: PDF_DARK, align: "right" });
    drawText(row.refundsCents > 0 ? `-${pdfMoney(row.refundsCents)}` : "-", refR, midY, { font: "F1", size: 9.5, color: PDF_DARK, align: "right" });
    drawText(row.totalCents < 0 ? `-${pdfMoney(-row.totalCents)}` : pdfMoney(row.totalCents), netR, midY, { font: "F2", size: 9.5, color: PDF_DARK, align: "right" });
    y -= rowH;
    drawLine(M, y, R, y, PDF_LIGHT_LINE, 0.6);
  });

  // Daily breakdown.
  const timeX = M + 10; const custX = M + 74; const invX = M + 330; const methX = M + 404; const amtR = R - 10;
  const drawDayHeader = (day: DepositPdfDay) => {
    ensureSpace(64);
    y -= 12;
    drawRect(M, y - 20, W, 20, PDF_DARK);
    drawText(day.label.toUpperCase(), M + 10, y - 13.5, { font: "F2", size: 8.5, color: PDF_WHITE });
    drawText(`DAY TOTAL ${day.totalCents < 0 ? `-${pdfMoney(-day.totalCents)}` : pdfMoney(day.totalCents)}`, amtR, y - 13.5, { font: "F2", size: 8.5, color: PDF_YELLOW, align: "right" });
    y -= 20;
    drawText(`Cash ${pdfMoney(day.cashCents)} - Card ${pdfMoney(day.cardCents)} - Check ${pdfMoney(day.checkCents)}`, M + 10, y - 11, { font: "F1", size: 8, color: PDF_GREY });
    y -= 15;
  };
  for (const day of data.days) {
    drawDayHeader(day);
    for (const entry of day.entries) {
      if (y - 16 < 58) { startPage(true); drawDayHeader(day); }
      const midY = y - 11;
      drawText(entry.timeLabel, timeX, midY, { font: "F1", size: 8.5, color: PDF_GREY });
      const custLabel = entry.amountCents < 0 ? `${entry.customerName} (refund)` : entry.customerName;
      const custShown = custLabel.length > 42 ? `${custLabel.slice(0, 41)}...` : custLabel;
      drawText(custShown, custX, midY, { font: "F1", size: 8.5, color: PDF_DARK });
      drawText(entry.invoiceNumber !== null ? `#${entry.invoiceNumber}` : "-", invX, midY, { font: "F1", size: 8.5, color: PDF_DARK });
      drawText(DEPOSIT_METHOD_LABEL[entry.method], methX, midY, { font: "F1", size: 8.5, color: PDF_DARK });
      drawText(entry.amountCents < 0 ? `-${pdfMoney(-entry.amountCents)}` : pdfMoney(entry.amountCents), amtR, midY, { font: "F2", size: 8.5, color: entry.amountCents < 0 ? PDF_RED : PDF_DARK, align: "right" });
      y -= 16;
      drawLine(M, y + 3, R, y + 3, PDF_LIGHT_LINE, 0.4);
    }
    ensureSpace(18);
    drawText(`Day subtotal - ${day.count} entr${day.count === 1 ? "y" : "ies"}`, timeX, y - 11, { font: "F2", size: 8.5, color: PDF_GREY });
    drawText(day.totalCents < 0 ? `-${pdfMoney(-day.totalCents)}` : pdfMoney(day.totalCents), amtR, y - 11, { font: "F2", size: 9.5, color: PDF_DARK, align: "right" });
    y -= 18;
  }
  if (data.days.length === 0) { drawText("No payments were received in this period.", mX, y - 15, { font: "F3", size: 9, color: PDF_GREY }); y -= 26; }

  // Grand totals.
  ensureSpace(120);
  y -= 16;
  const totX = 356; const totW = R - totX;
  drawText("Deposit summary", M, y - 2, { font: "F2", size: 10, color: PDF_DARK });
  drawText("Match this grand total against the bank deposit", M, y - 16, { font: "F1", size: 8.5, color: PDF_GREY });
  drawText("for the period. Refunds are already subtracted.", M, y - 28, { font: "F1", size: 8.5, color: PDF_GREY });
  const totalRow = (label: string, cents: number, negative = false) => {
    drawText(label, totX, y, { font: "F1", size: 9.5, color: PDF_GREY });
    drawText(negative ? `-${pdfMoney(cents)}` : pdfMoney(cents), amtR, y, { font: "F1", size: 9.5, color: PDF_DARK, align: "right" });
    y -= 15;
  };
  totalRow("Payments received", data.paymentsCents);
  if (data.refundsCents > 0) totalRow("Refunds", data.refundsCents, true);
  drawLine(totX, y + 4, R, y + 4, PDF_LIGHT_LINE, 0.8);
  y -= 2;
  drawRect(totX - 8, y - 19, totW + 16, 27, PDF_BLACK);
  drawText("GRAND TOTAL", totX, y, { font: "F2", size: 11, color: PDF_WHITE });
  drawText(data.totalCents < 0 ? `-${pdfMoney(-data.totalCents)}` : pdfMoney(data.totalCents), amtR, y, { font: "F2", size: 13, color: PDF_YELLOW, align: "right" });
  y -= 30;

  const totalPages = pages.length;
  pages.forEach((pageOps, i) => {
    const footer: string[] = [];
    const pushText = (text: string, x: number, ty: number, size: number, color: PdfColor, align: "left" | "right" | "center", font: "F1" | "F2" | "F3" = "F1") => {
      const safe = pdfSafeText(text); let tx = x; const width = pdfTextWidth(safe, size, font === "F2");
      if (align === "right") tx = x - width; else if (align === "center") tx = x - width / 2;
      footer.push(`BT /${font} ${size} Tf ${colorOp(color)} 1 0 0 1 ${tx.toFixed(2)} ${ty.toFixed(2)} Tm (${pdfEscape(safe)}) Tj ET`);
    };
    footer.push(colorOp(PDF_LIGHT_LINE, true), `0.7 w ${M} 44 m ${R} 44 l S`);
    pushText("RIMA Supply Company - Deposit Report", PW / 2, 32, 8, PDF_GREY, "center");
    pushText(`Page ${i + 1} of ${totalPages}`, R, 20, 7.5, PDF_GREY, "right");
    pushText(`${data.periodLabel} - ${data.generatedShort}`, M, 20, 7.5, PDF_GREY, "left");
    pageOps.push(...footer);
  });

  const encoder = new TextEncoder();
  const hasLogo = logo !== null;
  const imageId = 6;
  const firstPageId = 7;
  const pageIds = pages.map((_, i) => firstPageId + i * 2);
  const objects: Array<{ id: number; chunks: Array<string | Uint8Array> }> = [];
  objects.push({ id: 1, chunks: ["<< /Type /Catalog /Pages 2 0 R >>"] });
  objects.push({ id: 2, chunks: [`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`] });
  objects.push({ id: 3, chunks: ["<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"] });
  objects.push({ id: 4, chunks: ["<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"] });
  objects.push({ id: 5, chunks: ["<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>"] });
  if (hasLogo && logo) {
    objects.push({ id: imageId, chunks: [`<< /Type /XObject /Subtype /Image /Width 1078 /Height 766 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logo.length} >>\nstream\n`, logo, "\nendstream"] });
  }
  pages.forEach((pageOps, i) => {
    const pageId = firstPageId + i * 2; const contentId = pageId + 1;
    const resources = hasLogo ? `<< /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> /XObject << /Im1 ${imageId} 0 R >> >>` : `<< /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >>`;
    objects.push({ id: pageId, chunks: [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources ${resources} /Contents ${contentId} 0 R >>`] });
    const stream = pageOps.join("\n");
    objects.push({ id: contentId, chunks: [`<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}\nendstream`] });
  });
  objects.sort((a, b) => a.id - b.id);
  const chunks: Uint8Array[] = [];
  let length = 0;
  const pushChunk = (chunk: string | Uint8Array) => { const bytes = typeof chunk === "string" ? encoder.encode(chunk) : chunk; chunks.push(bytes); length += bytes.length; };
  pushChunk("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  const offsets = new Map<number, number>();
  for (const obj of objects) {
    offsets.set(obj.id, length);
    pushChunk(`${obj.id} 0 obj\n`);
    for (const chunk of obj.chunks) pushChunk(chunk);
    pushChunk("\nendobj\n");
  }
  const xrefStart = length;
  const maxId = Math.max(...objects.map((o) => o.id));
  let xref = `xref\n0 ${maxId + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= maxId; id += 1) xref += `${String(offsets.get(id) ?? 0).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  pushChunk(xref);
  const all = new Uint8Array(length);
  let pos = 0;
  for (const chunk of chunks) { all.set(chunk, pos); pos += chunk.length; }
  return new Blob([all.buffer as ArrayBuffer], { type: "application/pdf" });
}

async function downloadDepositPdf(filename: string, data: DepositPdfData) {
  const blob = await buildDepositPdfBlob(data);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = pdfFilename(filename);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 8000);
}

function DepositActions({ subject, body, filename, pdfData }: { subject: string; body: string; filename: string; pdfData: DepositPdfData }) {
  const [note, setNote] = useState("");
  const gmailHref = gmailComposeUrl("", subject, body);
  const mailtoHref = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  const textHref = `sms:?&body=${encodeURIComponent(smsBodyFor(body))}`;
  const doPrint = () => {
    setNote("Preparing print preview…");
    void buildDepositPdfBlob(pdfData)
      .then((blob) => { openPdfInTab(blob); setNote(""); })
      .catch(() => {
        printDocument(subject, body, <DepositDocument data={pdfData} />);
        setNote("");
      });
    setNote("");
  };
  const getPdf = () => {
    setNote("Preparing your deposit report PDF…");
    void downloadDepositPdf(filename, pdfData)
      .then(() => setNote("Deposit report PDF downloaded — open it from Downloads to print or share."))
      .catch(() => setNote("Could not build the PDF — try Print instead."));
  };
  return <div className="delivery-actions-wrap">
    <div className="delivery-actions" aria-label="Deposit report delivery options">
      <button type="button" className="print-action" onClick={doPrint} aria-label="Print deposit report"><PrinterIcon /> Print / PDF</button>
      <a href={gmailHref} target="_blank" rel="noopener noreferrer" aria-label="Email deposit report in Gmail" onClick={() => setNote("Opening Gmail — add the recipient (you, your accountant) and send.")}><MailIcon /> Email (Gmail)</a>
      <a href={mailtoHref} aria-label="Email deposit report with mail app">Mail app</a>
      <a href={textHref} aria-label="Text deposit report" onClick={() => setNote("Opening Messages — pick who receives the summary.")}><MessageIcon /> Text</a>
      <button type="button" onClick={getPdf} aria-label="Download PDF of deposit report"><DownloadIcon /> Save PDF</button>
    </div>
    {note ? <p className="delivery-note" role="status">{note}</p> : <p className="delivery-note">Email opens a ready-to-send draft — add the recipient before sending.</p>}
  </div>;
}

type DepositPreset = "today" | "month" | "lastMonth" | "last30" | "year" | "all" | "custom";
function depositPresetRange(preset: Exclude<DepositPreset, "custom">): { start: string; end: string } {
  const now = new Date();
  if (preset === "today") return { start: isoDate(now), end: isoDate(now) };
  return presetRange(preset);
}

function DepositsView({ onOpenCustomer }: { onOpenCustomer: (id: number) => void }) {
  const [preset, setPreset] = useState<DepositPreset>("month");
  const [range, setRange] = useState(() => depositPresetRange("month"));
  const startDate = range.start || null;
  const endDate = range.end || null;
  const report = useQuery({ queryKey: ["deposit-report", startDate, endDate], queryFn: () => api.getDepositReport({ start_date: startDate, end_date: endDate }) });
  const pickPreset = (value: DepositPreset) => { setPreset(value); if (value !== "custom") setRange(depositPresetRange(value)); };
  const setManual = (key: "start" | "end", value: string) => { setPreset("custom"); setRange((current) => ({ ...current, [key]: value })); };
  const data = report.data;
  const pdfData = data ? depositPdfData(data) : null;
  const totals = data?.totals;
  return <>
    <section className="plain-command"><div><p>DEPOSITS</p><h1>Deposit reports</h1></div><span className="analytics-period">{data ? data.period_label : prettyRange(range.start, range.end)}</span></section>
    <p className="field-intro">Pick a timeframe and pull up every payment received in that period — cash, card, and check — with a subtotal for each day and a grand total to match against the bank. Refunds are shown as negative entries and already taken out of the totals.</p>
    <section className="analytics-filters" aria-label="Deposit report date range">
      <div className="preset-chips" role="group" aria-label="Deposit date range presets">
        {([["today", "Today"], ["month", "This month"], ["lastMonth", "Last month"], ["last30", "Last 30 days"], ["year", "This year"], ["all", "All time"], ["custom", "Custom"]] as Array<[DepositPreset, string]>).map(([value, label]) => <button key={value} type="button" className={preset === value ? "active" : ""} onClick={() => pickPreset(value)} aria-label={`Deposit range: ${label}`}>{label}</button>)}
      </div>
      <div className="date-inputs">
        <label><span>From</span><input aria-label="Deposit report start date" type="date" value={range.start} onChange={(event) => setManual("start", event.target.value)} /></label>
        <label><span>To</span><input aria-label="Deposit report end date" type="date" value={range.end} onChange={(event) => setManual("end", event.target.value)} /></label>
      </div>
      <p className="field-note">Based on the day each payment was recorded. Payments toward an older invoice count on the day the money came in, not the invoice date.</p>
    </section>
    <div className="analytics-totals" aria-label="Deposit totals">
      <div><span>Grand total</span><strong>{totals ? signedMoney(totals.total_cents) : "—"}</strong></div>
      <div><span>Cash</span><strong>{totals ? signedMoney(totals.cash_cents) : "—"}</strong></div>
      <div><span>Card</span><strong>{totals ? signedMoney(totals.card_cents) : "—"}</strong></div>
      <div><span>Check</span><strong>{totals ? signedMoney(totals.check_cents) : "—"}</strong></div>
      <div><span>Payments</span><strong>{totals ? totals.payment_count.toLocaleString() : "—"}</strong></div>
      <div><span>Days</span><strong>{totals ? totals.day_count.toLocaleString() : "—"}</strong></div>
    </div>
    {report.isPending ? <div className="loading-list"><span /><span /></div> : report.isError ? <div className="empty-state"><h2>Couldn&apos;t load that report</h2><p>Try again — if it keeps failing, narrow the date range.</p></div> : data && data.totals.entry_count === 0 ? <div className="empty-state"><h2>No payments in this period</h2><p>No cash, card, or check payments were recorded between these dates. Try a wider range — payments will show up here the day they&apos;re taken at checkout or on an account.</p></div> : data && pdfData ? <>
      <DepositDocument data={pdfData} />
      <div className="statement-delivery" style={{ marginTop: 16 }}><div><strong>Send this deposit report</strong><span>Print / PDF, Gmail, mail app, or text — the full branded report for {data.period_label}.</span></div><DepositActions subject={`RIMA Deposit Report — ${data.period_label}`} body={depositReportText(data)} filename={`RIMA-deposit-report-${range.start || "all"}-${range.end || "today"}.pdf`} pdfData={pdfData} /></div>
      <section className="inventory-section" aria-label="Payments in this period">
        <div className="section-heading"><div><p>DETAIL</p><h1>Payments in this period</h1></div><span>{data.totals.entry_count} entr{data.totals.entry_count === 1 ? "y" : "ies"}</span></div>
        <div className="customer-list orders-list deposit-entry-list">
          {data.days.map((day) => <div key={day.date} className="deposit-list-day">
            <div className="deposit-list-day-head"><strong>{depositDayLabel(day.date)}</strong><span>{signedMoney(day.total_cents)} · Cash {money(day.cash_cents)} · Card {money(day.card_cents)} · Check {money(day.check_cents)}</span></div>
            {day.entries.map((entry) => entry.customer_id !== null ? <button key={entry.id} type="button" onClick={() => onOpenCustomer(entry.customer_id as number)} aria-label={`Open account for ${entry.customer_name}, ${DEPOSIT_METHOD_LABEL[entry.method]} payment of ${signedMoney(entry.amount_cents)}`}>
              <span className="customer-copy"><strong>{entry.customer_name}</strong><small>{depositTimeLabel(entry.created_at)} · {DEPOSIT_METHOD_LABEL[entry.method]}{entry.invoice_number !== null ? ` · Invoice #${entry.invoice_number}` : ""}{entry.amount_cents < 0 ? " · Refund" : ""}</small></span>
              <span className="balance-label"><b>{signedMoney(entry.amount_cents)}</b></span>
              <ChevronIcon />
            </button> : <div key={entry.id} className="deposit-entry-static">
              <span className="customer-copy"><strong>{entry.customer_name}</strong><small>{depositTimeLabel(entry.created_at)} · {DEPOSIT_METHOD_LABEL[entry.method]}{entry.invoice_number !== null ? ` · Invoice #${entry.invoice_number}` : ""}{entry.amount_cents < 0 ? " · Refund" : ""}</small></span>
              <span className="balance-label"><b>{signedMoney(entry.amount_cents)}</b></span>
            </div>)}
          </div>)}
        </div>
      </section>
    </> : null}
  </>;
}

type AccountingTab = "bills" | "pl" | "unpaid" | "exports";
type PlPreset = "month" | "lastMonth" | "ytd" | "custom";

function plPresetRange(preset: PlPreset): { start: string; end: string } {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  if (preset === "month") return { start: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`, end: fmt(now) };
  if (preset === "lastMonth") {
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const last = new Date(now.getFullYear(), now.getMonth(), 0);
    return { start: fmt(first), end: fmt(last) };
  }
  if (preset === "ytd") return { start: `${now.getFullYear()}-01-01`, end: fmt(now) };
  return { start: "", end: "" };
}

function AccountingView() {
  const [tab, setTab] = useState<AccountingTab>("bills");
  const [plPreset, setPlPreset] = useState<PlPreset>("month");
  const [plRange, setPlRange] = useState(() => plPresetRange("month"));
  const [billFormOpen, setBillFormOpen] = useState(false);
  const [editingBill, setEditingBill] = useState<null | { id: number; vendor_name: string; invoice_number: string; bill_date: string; due_date: string | null; amount_cents: number; category: string; notes: string }>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  const billsQuery = useQuery({ queryKey: ["bills"], queryFn: () => api.listBills({}) });
  const categoriesQuery = useQuery({ queryKey: ["expense-categories"], queryFn: () => api.listExpenseCategories({}) });
  const unpaidQuery = useQuery({ queryKey: ["unpaid-bills"], queryFn: () => api.getUnpaidBills({}), enabled: tab === "unpaid" });
  const plQuery = useQuery({
    queryKey: ["profit-loss", plRange.start, plRange.end],
    queryFn: () => api.getProfitLoss({ start_date: plRange.start, end_date: plRange.end }),
    enabled: tab === "pl" && !!plRange.start && !!plRange.end,
  });

  const pickPlPreset = (p: PlPreset) => { setPlPreset(p); if (p !== "custom") setPlRange(plPresetRange(p)); };
  const setPlManual = (key: "start" | "end", v: string) => { setPlPreset("custom"); setPlRange((c) => ({ ...c, [key]: v })); };

  const handleUpload = async (file: File) => {
    setUploading(true); setUploadError("");
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const result = await api.uploadBillPdf({ file_name: file.name, data_base64: dataUrl, mime_type: "application/pdf" });
      if (!result.ok) { setUploadError(result.error ?? "Could not read that PDF."); return; }
      // Pre-fill the bill form with extracted data.
      const ex = result.extracted;
      setEditingBill({
        id: 0,
        vendor_name: ex?.vendor_name ?? "",
        invoice_number: ex?.invoice_number ?? "",
        bill_date: ex?.bill_date ?? new Date().toISOString().slice(0, 10),
        due_date: ex?.due_date || null,
        amount_cents: ex?.amount_cents ?? 0,
        category: "Other",
        notes: `Uploaded from ${file.name}`,
      });
      setBillFormOpen(true);
    } catch {
      setUploadError("Could not read that file. Try again.");
    } finally {
      setUploading(false);
    }
  };

  const bills = billsQuery.data?.bills ?? [];
  const categories = categoriesQuery.data?.categories ?? [];
  const pl = plQuery.data;

  return <>
    <section className="plain-command"><div><p>ACCOUNTING</p><h1>Bills &amp; P&amp;L</h1></div></section>
    <p className="field-intro">Track every business bill and expense here — upload supplier invoices or enter cash and check payments by hand. The P&amp;L pulls real sales (test invoices excluded) so you get true numbers for the accountant.</p>

    <div className="pill-tabs" role="tablist" aria-label="Accounting sections">
      {([["bills", "Bills"], ["pl", "P&L"], ["unpaid", "Unpaid"], ["exports", "Exports"]] as Array<[AccountingTab, string]>).map(([v, label]) => (
        <button key={v} type="button" role="tab" aria-selected={tab === v} className={tab === v ? "active" : ""} onClick={() => setTab(v)}>{label}</button>
      ))}
    </div>

    {tab === "bills" && <>
      <div className="accounting-toolbar">
        <button type="button" className="primary-button" onClick={() => { setEditingBill(null); setBillFormOpen(true); }}>Add Bill</button>
        <button type="button" className="secondary-button" disabled={uploading} onClick={() => fileRef.current?.click()}>{uploading ? "Reading PDF…" : "Upload Bill PDF"}</button>
        <input ref={fileRef} type="file" accept="application/pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ""; }} />
      </div>
      {uploadError ? <p className="field-error">{uploadError}</p> : null}
      {billsQuery.isPending ? <div className="loading-list"><span /><span /></div> :
        bills.length === 0 ? <div className="empty-state"><h2>No bills yet</h2><p>Add your first bill above — supplier invoices, rent, utilities, anything the business pays.</p></div> :
        <div className="accounting-list">{bills.map((b) => <BillRow key={b.id} bill={b} onEdit={() => { setEditingBill({ id: b.id, vendor_name: b.vendor_name, invoice_number: b.invoice_number, bill_date: b.bill_date, due_date: b.due_date, amount_cents: b.amount_cents, category: b.category, notes: b.notes }); setBillFormOpen(true); }} />)}</div>}
    </>}

    {tab === "pl" && <>
      <section className="analytics-filters" aria-label="P&L date range">
        <div className="preset-chips" role="group" aria-label="P&L presets">
          {([["month", "This month"], ["lastMonth", "Last month"], ["ytd", "Year to date"], ["custom", "Custom"]] as Array<[PlPreset, string]>).map(([v, label]) => <button key={v} type="button" className={plPreset === v ? "active" : ""} onClick={() => pickPlPreset(v)}>{label}</button>)}
        </div>
        <div className="date-inputs">
          <label><span>From</span><input type="date" value={plRange.start} onChange={(e) => setPlManual("start", e.target.value)} /></label>
          <label><span>To</span><input type="date" value={plRange.end} onChange={(e) => setPlManual("end", e.target.value)} /></label>
        </div>
      </section>
      {plQuery.isPending ? <div className="loading-list"><span /><span /></div> : pl ? <>
        <section className="accounting-pl" aria-label="Profit and loss statement">
          <div className="pl-row"><span>Revenue</span><strong>{money(pl.revenue_cents)}</strong></div>
          <div className="pl-row"><span>Cost of goods sold</span><strong>({money(pl.cogs_cents)})</strong></div>
          <div className="pl-row pl-subtotal"><span>Gross profit</span><strong>{money(pl.gross_profit_cents)}</strong></div>
          <div className="pl-section-label">Expenses</div>
          {pl.expenses_by_category.length === 0 ? <div className="pl-row"><span className="muted">No expenses recorded</span><strong>—</strong></div> :
            pl.expenses_by_category.map((e) => <div key={e.category} className="pl-row"><span>{e.category}</span><strong>({money(e.amount_cents)})</strong></div>)}
          <div className="pl-row"><span>Total expenses</span><strong>({money(pl.expenses_cents)})</strong></div>
          <div className={`pl-row pl-total ${pl.net_income_cents < 0 ? "negative" : ""}`}><span>Net income</span><strong>{money(pl.net_income_cents)}</strong></div>
        </section>
        <p className="field-note">Revenue and COGS come from real sales only — test invoices 1001–1010 are excluded. Expenses come from bills entered above.</p>
      </> : null}
    </>}

    {tab === "unpaid" && <>
      {unpaidQuery.isPending ? <div className="loading-list"><span /><span /></div> :
        !unpaidQuery.data || unpaidQuery.data.bills.length === 0 ? <div className="empty-state"><h2>Nothing unpaid</h2><p>Every bill is paid up. Nice.</p></div> : <>
          <div className="accounting-totals"><div><span>Total unpaid</span><strong>{money(unpaidQuery.data.total_cents)}</strong></div></div>
          <div className="accounting-list">{unpaidQuery.data.bills.map((b) => (
            <div key={b.id} className={`accounting-card${b.is_overdue ? " overdue" : ""}`}>
              <span className="customer-copy"><strong>{b.vendor_name}</strong><small>{b.bill_date}{b.due_date ? ` · Due ${b.due_date}` : " · No due date"}{b.is_overdue ? " · OVERDUE" : ""}{b.invoice_number ? ` · #${b.invoice_number}` : ""}</small></span>
              <span className="balance-label"><b>{money(b.amount_cents)}</b></span>
              <MarkBillPaidButton billId={b.id} />
            </div>
          ))}</div>
        </>}
    </>}

    {tab === "exports" && <ExportsTab />}

    {billFormOpen ? <BillForm
      categories={categories.map((c) => c.name)}
      initial={editingBill}
      onClose={() => { setBillFormOpen(false); setEditingBill(null); }}
    /> : null}
  </>;
}

function ExportsTab() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState("");

  const doDownload = async (kind: "orders" | "expenses" | "customers" | "products") => {
    setDownloading(kind); setError("");
    try {
      const dateArgs = (kind === "orders" || kind === "expenses")
        ? { ...(startDate ? { start_date: startDate } : {}), ...(endDate ? { end_date: endDate } : {}) }
        : {};
      const result = kind === "orders" ? await api.exportOrders(dateArgs)
        : kind === "expenses" ? await api.exportExpenses(dateArgs)
        : kind === "customers" ? await api.exportCustomers({})
        : await api.exportProducts({});
      if (!result.ok) { setError("Export failed. Try again."); return; }
      const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = result.filename;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setError("Export failed. Check your connection and try again.");
    } finally {
      setDownloading(null);
    }
  };

  const doBackup = async () => {
    setDownloading("backup"); setError("");
    try {
      const result = await api.backupDatabase({});
      if (!result.ok) { setError(result.error ?? "Backup failed. Try again."); return; }
      const bytes = Uint8Array.from(atob(result.data_base64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/x-sqlite3" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = result.filename;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setError("Backup failed. Check your connection and try again.");
    } finally {
      setDownloading(null);
    }
  };

  const cards: Array<{ kind: "orders" | "expenses" | "customers" | "products"; title: string; desc: string; dated: boolean }> = [
    { kind: "orders", title: "Orders", desc: "Every invoice with line items — customer, products, quantities, totals, payment status. One row per line item.", dated: true },
    { kind: "expenses", title: "Expenses", desc: "All bills and expenses — vendor, date, amount, category, paid status.", dated: true },
    { kind: "customers", title: "Customers", desc: "Full customer list — name, business, contact info, address, balance due.", dated: false },
    { kind: "products", title: "Product Catalog", desc: "Every product — title, part #, SKU, vendor, price, cost, stock, barcode.", dated: false },
  ];

  return <>
    <p className="field-intro">Download your business data as CSV files — open them in Excel or Google Sheets, or hand them to your accountant.</p>
    <div className="export-card export-backup">
      <span className="customer-copy"><strong>Backup Everything</strong><small>Download a complete copy of your entire database — every product, customer, order, bill, and setting. Keep it somewhere safe.</small></span>
      <button type="button" className="primary-button" disabled={downloading !== null} onClick={() => void doBackup()}>
        {downloading === "backup" ? "Preparing…" : "Download Backup"}
      </button>
    </div>
    {(cards.some((c) => c.dated)) ? (
      <section className="analytics-filters" aria-label="Export date range">
        <div className="date-inputs">
          <label><span>From</span><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
          <label><span>To</span><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>
          {(startDate || endDate) ? <button type="button" className="secondary-button" onClick={() => { setStartDate(""); setEndDate(""); }}>Clear</button> : null}
        </div>
        <p className="field-note">Date range applies to Orders and Expenses. Customers and Products always export everything.</p>
      </section>
    ) : null}
    {error ? <p className="field-error">{error}</p> : null}
    <div className="export-grid">
      {cards.map((c) => (
        <div key={c.kind} className="export-card">
          <span className="customer-copy"><strong>{c.title}</strong><small>{c.desc}</small></span>
          <button type="button" className="primary-button" disabled={downloading !== null} onClick={() => void doDownload(c.kind)}>
            {downloading === c.kind ? "Preparing…" : "Download CSV"}
          </button>
        </div>
      ))}
    </div>
    <p className="field-note">Test invoices (1001–1010) and test bills are excluded from exports.</p>
  </>;
}

function BillRow({ bill, onEdit }: {
  bill: { id: number; vendor_name: string; invoice_number: string; bill_date: string; due_date: string | null; amount_cents: number; category: string; payment_method: string; paid_at: string | null; notes: string; has_attachment: boolean };
  onEdit: () => void;
}) {
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const markPaid = useMutation({
    mutationFn: (method: "cash" | "check" | "card" | "ach") => api.markBillPaid({ id: bill.id, payment_method: method }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["bills"] }),
  });
  const remove = useMutation({
    mutationFn: () => api.deleteBill({ id: bill.id }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["bills"] }); queryClient.invalidateQueries({ queryKey: ["unpaid-bills"] }); },
  });
  const isPaid = bill.payment_method !== "unpaid";
  return <div className="accounting-card">
    <span className="customer-copy">
      <strong>{bill.vendor_name}</strong>
      <small>{bill.bill_date}{bill.invoice_number ? ` · #${bill.invoice_number}` : ""} · <span className="category-badge">{bill.category}</span></small>
      {bill.notes ? <small className="muted">{bill.notes}</small> : null}
    </span>
    <span className="balance-label"><b>{money(bill.amount_cents)}</b><small className={isPaid ? "paid" : "unpaid"}>{isPaid ? `Paid · ${bill.payment_method}` : "Unpaid"}</small></span>
    <span className="accounting-actions">
      {!isPaid ? <select aria-label={`Mark bill ${bill.id} paid`} defaultValue="" onChange={(e) => { if (e.target.value) markPaid.mutate(e.target.value as "cash" | "check" | "card" | "ach"); }}>
        <option value="" disabled>Mark paid…</option>
        <option value="cash">Cash</option><option value="check">Check</option><option value="card">Card</option><option value="ach">ACH</option>
      </select> : null}
      <button type="button" className="link-button" onClick={onEdit}>Edit</button>
      {confirmDelete
        ? <><button type="button" className="link-button danger" onClick={() => remove.mutate()}>Confirm</button><button type="button" className="link-button" onClick={() => setConfirmDelete(false)}>Keep</button></>
        : <button type="button" className="link-button danger" onClick={() => setConfirmDelete(true)}>Delete</button>}
    </span>
  </div>;
}

function MarkBillPaidButton({ billId }: { billId: number }) {
  const queryClient = useQueryClient();
  const markPaid = useMutation({
    mutationFn: (method: "cash" | "check" | "card" | "ach") => api.markBillPaid({ id: billId, payment_method: method }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["bills"] }); queryClient.invalidateQueries({ queryKey: ["unpaid-bills"] }); },
  });
  return <select aria-label={`Mark bill ${billId} paid`} defaultValue="" onChange={(e) => { if (e.target.value) markPaid.mutate(e.target.value as "cash" | "check" | "card" | "ach"); }}>
    <option value="" disabled>Mark paid…</option>
    <option value="cash">Cash</option><option value="check">Check</option><option value="card">Card</option><option value="ach">ACH</option>
  </select>;
}

function BillForm({ categories, initial, onClose }: {
  categories: string[];
  initial: null | { id: number; vendor_name: string; invoice_number: string; bill_date: string; due_date: string | null; amount_cents: number; category: string; notes: string };
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [vendor, setVendor] = useState(initial?.vendor_name ?? "");
  const [invoice, setInvoice] = useState(initial?.invoice_number ?? "");
  const [billDate, setBillDate] = useState(initial?.bill_date ?? new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(initial?.due_date ?? "");
  const [amount, setAmount] = useState(initial ? (initial.amount_cents / 100).toFixed(2) : "");
  const [category, setCategory] = useState(initial?.category ?? "Other");
  const [paymentMethod, setPaymentMethod] = useState("unpaid");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [error, setError] = useState("");

  const save = useMutation({
    mutationFn: () => {
      const cents = Math.round(parseFloat(amount || "0") * 100);
      if (!vendor.trim()) throw new Error("Vendor name is required.");
      if (!billDate) throw new Error("Bill date is required.");
      if (cents < 0) throw new Error("Amount can't be negative.");
      return initial && initial.id > 0
        ? api.updateBill({ id: initial.id, vendor_name: vendor.trim(), invoice_number: invoice.trim(), bill_date: billDate, due_date: dueDate || null, amount_cents: cents, category, notes: notes.trim() })
        : api.createBill({ vendor_name: vendor.trim(), invoice_number: invoice.trim(), bill_date: billDate, due_date: dueDate || undefined, amount_cents: cents, category, payment_method: paymentMethod as "unpaid" | "cash" | "check" | "card" | "ach", notes: notes.trim() });
    },
    onSuccess: (r) => {
      if (!r.ok) { setError(r.error ?? "Could not save that bill."); return; }
      queryClient.invalidateQueries({ queryKey: ["bills"] });
      queryClient.invalidateQueries({ queryKey: ["unpaid-bills"] });
      onClose();
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Could not save that bill."),
  });

  return <div className="modal-backdrop" onClick={onClose}>
    <div className="modal-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={initial?.id ? "Edit bill" : "Add bill"}>
      <h2>{initial?.id ? "Edit bill" : "Add bill"}</h2>
      {error ? <p className="field-error">{error}</p> : null}
      <label><span>Vendor</span><input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="National Oak, Eversource…" /></label>
      <div className="form-row">
        <label><span>Invoice #</span><input value={invoice} onChange={(e) => setInvoice(e.target.value)} placeholder="Optional" /></label>
        <label><span>Amount</span><input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" /></label>
      </div>
      <div className="form-row">
        <label><span>Bill date</span><input type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} /></label>
        <label><span>Due date</span><input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></label>
      </div>
      <div className="form-row">
        <label><span>Category</span><select value={category} onChange={(e) => setCategory(e.target.value)}>{categories.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
        {!(initial && initial.id > 0) ? <label><span>Payment</span><select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
          <option value="unpaid">Unpaid</option><option value="cash">Cash</option><option value="check">Check</option><option value="card">Card</option><option value="ach">ACH</option>
        </select></label> : null}
      </div>
      <label><span>Notes</span><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional notes" /></label>
      <div className="modal-actions">
        <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
        <button type="button" className="primary-button" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save bill"}</button>
      </div>
    </div>
  </div>;
}

function SettingsView() {
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ["invoice-settings"], queryFn: () => api.getInvoiceSettings({}) });
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!dirty && settings.data) setInvoiceNumber(String(settings.data.next_invoice_number));
  }, [dirty, settings.data]);
  const save = useMutation({
    mutationFn: () => api.updateInvoiceSettings({ starting_invoice_number: Number.parseInt(invoiceNumber, 10) }),
    onSuccess: async (result) => {
      if (!result.ok) { setMessage(result.error ?? "Could not save invoice numbering."); return; }
      setDirty(false);
      setInvoiceNumber(String(result.next_invoice_number));
      setMessage(`Saved. The next sale will be invoice #${result.next_invoice_number}.`);
      await queryClient.invalidateQueries({ queryKey: ["invoice-settings"] });
    },
    onError: () => setMessage("Could not save invoice numbering. Try again."),
  });
  const parsed = Number.parseInt(invoiceNumber, 10);
  const valid = Number.isInteger(parsed) && parsed > 0;
  return <><section className="plain-command"><div><p>SETTINGS</p><h1>Sales settings</h1></div></section><section className="settings-panel"><div className="settings-copy"><h2>Invoice numbering</h2><p>Set the number for the next receipt or invoice. It increases by one automatically every time a sale is completed.</p></div><form onSubmit={(event) => { event.preventDefault(); setMessage(""); if (valid) save.mutate(); }}><label htmlFor="starting-invoice-number">Starting / next invoice number</label><div className="invoice-setting-row"><span>#</span><input id="starting-invoice-number" aria-label="Starting invoice number" type="number" min="1" max="999999999" step="1" value={invoiceNumber} onChange={(event) => { setInvoiceNumber(event.target.value); setDirty(true); setMessage(""); }} /><button className="primary-button" type="submit" disabled={!valid || save.isPending}>{save.isPending ? "Saving…" : "Save number"}</button></div>{settings.data?.last_invoice_number !== null && settings.data?.last_invoice_number !== undefined ? <small>Last issued: #{settings.data.last_invoice_number}</small> : <small>No invoices have been issued yet.</small>}{message ? <p className={message.startsWith("Saved") ? "settings-success" : "form-error"} role="status">{message}</p> : null}</form></section><SalesBySalesperson /></>;
}

type AppUser = ApiResponse<typeof api, "listUsers">["users"][number];

type HelpGuide = { id: string; title: string; summary: string; steps: string[]; tips?: string[] };

const HELP_GUIDES: HelpGuide[] = [
  {
    id: "checkout",
    title: "Cash out a customer (Checkout)",
    summary: "Ring up a walk-in sale from start to printed receipt.",
    steps: [
      "Open Checkout from the sidebar (it's the home screen).",
      "Search for each item by name, part number, or scan the barcode, then tap it to add it to the ticket.",
      "Adjust quantities with the + / − buttons next to each line. Remove a line with the trash icon.",
      "If the customer has an account, tap the customer field and pick their name so the sale links to them.",
      "Check the salesperson field — make sure the right person is credited.",
      "Tap the payment button. Choose Cash, Card, or Check and enter the amount tendered.",
      "For account customers, you can charge it to their account instead of taking payment now.",
      "Tap Print for a paper receipt, or use Email / Text to send it to the customer.",
    ],
    tips: [
      "Walk-in sales are always charged 7% RI sales tax automatically.",
      "If a customer is tax-exempt, set that on their customer record first.",
    ],
  },
  {
    id: "returns",
    title: "Process a return",
    summary: "Take an item back and refund cash, card, or account credit.",
    steps: [
      "Open Returns from the sidebar.",
      "Find the original sale — search by invoice number or customer name.",
      "Select the item(s) being returned and enter the quantity coming back.",
      "Pick a reason for the return (defective, wrong item, customer changed mind, etc.).",
      "Choose the refund method: Cash, Card, or Account Credit.",
      "Confirm the return. The item goes back into inventory automatically.",
      "Print or send the return receipt for the customer.",
    ],
    tips: [
      "Account credit keeps the money on the customer's account for next time — good for regulars.",
      "Card refunds go back to the original card when possible.",
    ],
  },
  {
    id: "balance",
    title: "Check a customer balance",
    summary: "Look up what a customer owes in seconds.",
    steps: [
      "Open Customers from the sidebar.",
      "Search for the customer by name or phone number and tap their name.",
      "Their account page shows the total balance due at the top.",
      "Below that you'll see every open invoice with its amount and date.",
      "Tap any invoice to see its line items, payments, and remaining balance.",
      "Use the Accept Payment button on the account page to take a payment against the balance.",
    ],
    tips: [
      "The balance updates the moment a payment is recorded — no waiting.",
      "Statements (sidebar → Statements) give a formal month-by-month breakdown you can print or email.",
    ],
  },
  {
    id: "pricing",
    title: "Update a product price",
    summary: "Change a selling price — or let the markup rules do it for you.",
    steps: [
      "Open Products from the sidebar and search for the item.",
      "Tap the product to open its details, then Edit.",
      "Change the selling price and save.",
      "For cost changes: update the cost and the app recalculates the selling price from the markup rule automatically — your markup percent never changes unless you change it.",
      "To review automatic price changes before they go live, open Markup Rules from the sidebar and approve or deny each one.",
    ],
    tips: [
      "Selling-price changes always need approval — cost changes flow through on their own.",
      "Markup Rules shows every pending price recalculation in one place. Batch-approve when ready.",
    ],
  },
  {
    id: "new-product",
    title: "Add a new product",
    summary: "Get a new item into the catalog so it can be sold.",
    steps: [
      "Open Products from the sidebar, then tap Add Product (or New).",
      "Enter the part number first — that's what the title starts with.",
      "Fill in the product name, vendor/manufacturer, and a short description.",
      "Enter your cost and the selling price (or leave the price blank and let the markup rule set it).",
      "Add the barcode if the item has one — this makes checkout scanning work.",
      "Set the unit (each, box, case, gallon, etc.) and the par level if you want low-stock alerts.",
      "Save. The product is immediately searchable at checkout.",
    ],
    tips: [
      "Good titles start with the part number, e.g. \"3M 6654 — Masking Tape\".",
      "Set a par level and the Tuesday PO generator will remind you to reorder.",
    ],
  },
  {
    id: "field-order",
    title: "Take a field order (at a customer's shop)",
    summary: "Write up an order on your phone while standing in a body shop.",
    steps: [
      "Open Field Orders from the sidebar (works great on your phone).",
      "Tap New Order and pick the customer — or create them on the spot.",
      "Add items by searching or scanning. Quantities can be adjusted per line.",
      "Add any notes (e.g. \"needs it Thursday\", \"color match\").",
      "Save as Draft if you're still working, or Finalize when the order is confirmed.",
      "Back at the store, finalized field orders show up ready to pull and pack.",
    ],
    tips: [
      "Drafts are private to you until finalized — no one else sees them.",
      "The customer gets a confirmation with their order details.",
    ],
  },
  {
    id: "receiving",
    title: "Receive a shipment (purchase orders)",
    summary: "Check in what arrived and update inventory in one pass.",
    steps: [
      "Open Purchase from the sidebar.",
      "If you already made a PO: open it and tap Receive, then check off what arrived against what was ordered.",
      "If there's no PO: use the invoice-upload receiving — upload the supplier's invoice PDF and match the lines to products.",
      "For items that didn't arrive, mark them backordered so the next PO nets them out.",
      "Confirm the receipt. On-hand quantities update automatically.",
      "Costs on the invoice update your product costs (selling prices recalculate per markup rules).",
    ],
    tips: [
      "Always receive against the PO when you have one — it's faster and catches shortages.",
      "The Tuesday PO generator subtracts what's already inbound, so receiving promptly keeps orders accurate.",
    ],
  },
  {
    id: "statement",
    title: "Run a customer statement",
    summary: "Print or email a formal statement of what a customer owes.",
    steps: [
      "Open Statements from the sidebar.",
      "Pick the customer and the month/year.",
      "The app builds a statement of that period's invoices with a total due.",
      "Tap Print for a branded paper copy, or Email / Text to send it straight to the customer's AP contact.",
    ],
    tips: [
      "Statements pull the AP email from the customer record — keep it up to date.",
      "Every statement looks branded and professional, end to end.",
    ],
  },
  {
    id: "deposits",
    title: "End-of-day: deposits report",
    summary: "Reconcile the day's take in a couple of taps.",
    steps: [
      "Open Deposits from the sidebar.",
      "Pick today (or any range) — presets or custom dates.",
      "You'll see every payment broken down by cash, card, and check, with received vs. refunded vs. net.",
      "Day-grouped subtotals plus a grand total at the bottom.",
      "Print the branded deposit report for your records or the bank bag.",
    ],
    tips: [
      "Run this at close every day — it takes ten seconds and keeps the drawer honest.",
    ],
  },
  {
    id: "customers",
    title: "Add or edit a customer",
    summary: "Keep customer records complete so billing just works.",
    steps: [
      "Open Customers, then tap Add Customer.",
      "Enter the shop name, contact person, phone, and email.",
      "Fill in the AP (accounts payable) contact and email — statements and invoices go here.",
      "Add the delivery address — the app picks RI 7% or MA 6.25% tax from the state automatically.",
      "Set tax-exempt if they gave you a certificate, and save their tax ID.",
      "Card on file: record last 4 digits, expiry, and cardholder name only.",
    ],
    tips: [
      "The \"print total balance on receipts\" toggle is per customer — turn it off for net-30 accounts that don't want the full balance on every receipt.",
    ],
  },
];

type DailyTask = ApiResponse<typeof api, "getDailyTasks">["tasks"][number];

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function prettyDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function TaskForm({ initial, employees, onClose, onSaved }: {
  initial: DailyTask | null;
  employees: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [assignedTo, setAssignedTo] = useState(initial?.assigned_to ?? employees[0] ?? "Randy");
  const [dueDate, setDueDate] = useState(initial?.due_date ?? toISODate(new Date()));
  const [repeatPattern, setRepeatPattern] = useState<"none" | "daily" | "weekly">(initial?.repeat_pattern ?? "none");
  const [priority, setPriority] = useState<"low" | "normal" | "high">(initial?.priority ?? "normal");
  const [taskType, setTaskType] = useState<"task" | "sales_call" | "visit">(initial?.task_type ?? "task");
  const [customerId, setCustomerId] = useState<number | null>(initial?.customer_id ?? null);
  const [customerLabel, setCustomerLabel] = useState(initial?.customer_name ?? "");
  const [customerSearch, setCustomerSearch] = useState("");
  const [error, setError] = useState("");
  const customerDeferred = useDeferredValue(customerSearch);
  const customerResults = useQuery({
    queryKey: ["task-customers", customerDeferred],
    queryFn: () => api.listCustomers({ query: customerDeferred, limit: 10 }),
    enabled: customerDeferred.trim().length > 0,
  });

  const save = useMutation({
    mutationFn: () => initial && initial.id > 0
      ? api.updateTask({ id: initial.id, title, description, assigned_to: assignedTo, due_date: dueDate, repeat_pattern: repeatPattern, customer_id: customerId, priority, task_type: taskType })
      : api.createTask({ title, description, assigned_to: assignedTo, due_date: dueDate, repeat_pattern: repeatPattern, customer_id: customerId, priority, task_type: taskType }),
    onSuccess: async (res) => {
      if (!res.ok) { setError(res.error ?? "Could not save the task."); return; }
      await queryClient.invalidateQueries({ queryKey: ["daily-tasks"] });
      onSaved();
    },
    onError: () => setError("Could not save the task. Check your connection and try again."),
  });

  return <div className="modal-backdrop" onClick={onClose}>
    <div className="modal-card tasks-form" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={initial ? "Edit task" : "Add task"}>
      <div className="modal-head"><h2>{initial ? "Edit task" : "Add task"}</h2><button type="button" className="icon-button" onClick={onClose} aria-label="Close"><CloseIcon /></button></div>
      <label>Title<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Run bank deposit" maxLength={300} /></label>
      <label>Details<textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Anything the person doing it should know" rows={2} maxLength={2000} /></label>
      <div className="tasks-form-row">
        <label>Assign to<select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>{employees.map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
        <label>Due date<input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></label>
      </div>
      <div className="tasks-form-row">
        <label>Repeat<select value={repeatPattern} onChange={(e) => setRepeatPattern(e.target.value as "none" | "daily" | "weekly")}><option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label>
        <label>Priority<select value={priority} onChange={(e) => setPriority(e.target.value as "low" | "normal" | "high")}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option></select></label>
        <label>Type<select value={taskType} onChange={(e) => setTaskType(e.target.value as "task" | "sales_call" | "visit")}><option value="task">Task</option><option value="sales_call">Sales call</option><option value="visit">Customer visit</option></select></label>
      </div>
      <label>Customer (optional){customerId !== null ? <span className="tasks-customer-pick">{customerLabel || `Customer #${customerId}`}<button type="button" onClick={() => { setCustomerId(null); setCustomerLabel(""); }} aria-label="Remove customer"><CloseIcon /></button></span> : <input value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} placeholder="Search customers…" />}{customerId === null && customerDeferred.trim() && customerResults.data ? <div className="tasks-customer-results">{customerResults.data.customers.map((c) => <button key={c.id} type="button" onClick={() => { setCustomerId(c.id); setCustomerLabel(c.business_name || c.name); setCustomerSearch(""); }}>{c.business_name || c.name}<small>{c.phone}</small></button>)}</div> : null}</label>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="form-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="button" className="primary-button" disabled={!title.trim() || save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : initial ? "Save changes" : "Add task"}</button></div>
    </div>
  </div>;
}

function TasksView() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const todayISO = toISODate(new Date());
  const [dateISO, setDateISO] = useState(todayISO);
  const [employee, setEmployee] = useState<string>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DailyTask | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);

  const teamQuery = useQuery({ queryKey: ["sales-team"], queryFn: () => api.listSalesTeam({}) });
  const teamNames = teamQuery.data?.members.filter((m) => m.active).map((m) => m.name) ?? [];
  const employees = teamNames.length ? teamNames : ["Randy", "Nathan", "Alan"];

  const dailyQuery = useQuery({
    queryKey: ["daily-tasks", dateISO, employee],
    queryFn: () => api.getDailyTasks({ date: dateISO, assigned_to: employee === "all" ? undefined : employee }),
  });

  const completedQuery = useQuery({
    queryKey: ["completed-tasks", dateISO, employee],
    queryFn: () => api.listTasks({ due_date: dateISO, assigned_to: employee === "all" ? undefined : employee, include_completed: true }),
    enabled: showCompleted,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["daily-tasks"] });
    void queryClient.invalidateQueries({ queryKey: ["completed-tasks"] });
  };

  const completeMut = useMutation({
    mutationFn: (id: number) => api.completeTask({ id }),
    onSuccess: () => invalidate(),
  });
  const reopenMut = useMutation({
    mutationFn: (id: number) => api.reopenTask({ id }),
    onSuccess: () => invalidate(),
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => api.deleteTask({ id }),
    onSuccess: () => invalidate(),
  });

  const shiftDate = (days: number) => {
    const [y, m, d] = dateISO.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + days);
    setDateISO(toISODate(dt));
  };

  const tasks = dailyQuery.data?.tasks ?? [];
  const visits = tasks.filter((t) => t.task_type === "visit");
  const calls = tasks.filter((t) => t.task_type === "sales_call");
  const followups = tasks.filter((t) => t.is_auto);
  const plain = tasks.filter((t) => t.task_type === "task" && !t.is_auto);
  const completed = (completedQuery.data?.tasks ?? []).filter((t) => t.is_completed === 1);

  const renderTask = (t: DailyTask) => <article key={`${t.is_auto ? "auto" : "db"}-${t.id}`} className={`tasks-card priority-${t.priority}`}>
    <button type="button" className="tasks-check" aria-label={t.is_completed ? "Reopen task" : "Complete task"} disabled={t.is_auto || t.id < 0}
      onClick={() => { if (!t.is_auto && t.id > 0) void completeMut.mutate(t.id); }}>
      <span className="tasks-checkbox" />
    </button>
    <div className="tasks-body">
      <div className="tasks-title-row"><strong>{t.title}</strong>{t.priority === "high" ? <span className="tasks-priority high">High</span> : t.priority === "low" ? <span className="tasks-priority low">Low</span> : null}{t.auto_label ? <span className="tasks-auto">{t.auto_label}</span> : null}</div>
      {t.description ? <p>{t.description}</p> : null}
      <div className="tasks-meta">
        {employee === "all" && t.assigned_to ? <span>{t.assigned_to}</span> : null}
        {t.customer_name ? <span className="tasks-customer">{t.customer_name}</span> : null}
        {t.repeat_pattern !== "none" ? <span className="tasks-repeat">{t.repeat_pattern === "daily" ? "Daily" : "Weekly"}</span> : null}
      </div>
    </div>
    {!t.is_auto && t.id > 0 ? <div className="tasks-actions">
      <button type="button" className="icon-button" aria-label="Edit task" onClick={() => { setEditing(t); setFormOpen(true); }}><SettingsIcon /></button>
      <button type="button" className="icon-button tasks-delete" aria-label="Delete task" onClick={() => { if (window.confirm(`Delete "${t.title}"?`)) void deleteMut.mutate(t.id); }}><TrashIcon /></button>
    </div> : null}
  </article>;

  const renderGroup = (label: string, items: DailyTask[]) => items.length === 0 ? null : <section className="tasks-group"><h3>{label} <span>{items.length}</span></h3><div className="tasks-list">{items.map(renderTask)}</div></section>;

  const isToday = dateISO === todayISO;
  const tomorrowISO = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return toISODate(d); })();

  return <>
    <section className="plain-command">
      <div><p>DAILY OPS</p><h1>Tasks</h1></div>
      <button type="button" className="primary-button" onClick={() => { setEditing(null); setFormOpen(true); }}><PlusIcon /> Add task</button>
    </section>

    <section className="tasks-controls">
      <div className="tasks-date-nav">
        <button type="button" className="secondary-button" onClick={() => shiftDate(-1)} aria-label="Previous day"><BackIcon /></button>
        <button type="button" className={isToday ? "tasks-date-btn active" : "tasks-date-btn"} onClick={() => setDateISO(todayISO)}>Today</button>
        <button type="button" className={dateISO === tomorrowISO ? "tasks-date-btn active" : "tasks-date-btn"} onClick={() => setDateISO(tomorrowISO)}>Tomorrow</button>
        <input type="date" value={dateISO} onChange={(e) => { if (e.target.value) setDateISO(e.target.value); }} aria-label="Pick a date" />
        <button type="button" className="secondary-button" onClick={() => shiftDate(1)} aria-label="Next day"><ChevronIcon /></button>
      </div>
      <div className="tasks-employee-tabs" role="tablist" aria-label="Filter by employee">
        {["all", ...employees].map((n) => <button key={n} type="button" role="tab" aria-selected={employee === n} className={employee === n ? "active" : ""} onClick={() => setEmployee(n)}>{n === "all" ? "All" : n}</button>)}
      </div>
    </section>

    {!isToday ? <p className="tasks-date-label">Showing {prettyDate(dateISO)}</p> : null}

    {dailyQuery.isPending ? <div className="loading-list"><span /><span /><span /></div>
      : tasks.length === 0 ? <div className="empty-state"><h2>Nothing on the list</h2><p>{isToday ? "Today is clear — add a task to get started." : "No tasks for this day yet."}</p><button className="primary-button" onClick={() => { setEditing(null); setFormOpen(true); }}>Add task</button></div>
      : <>
        {renderGroup("Customer visits", visits)}
        {renderGroup("Sales calls", calls)}
        {renderGroup("Tasks", plain)}
        {renderGroup("Follow-ups", followups)}
      </>}

    <section className="tasks-completed-toggle">
      <button type="button" className="secondary-button" onClick={() => setShowCompleted((v) => !v)}>{showCompleted ? "Hide completed" : "Show completed"}</button>
    </section>
    {showCompleted ? (completedQuery.isPending ? <div className="loading-list"><span /><span /></div>
      : completed.length === 0 ? <p className="tasks-empty-note">No completed tasks for this day.</p>
      : <section className="tasks-group"><h3>Completed <span>{completed.length}</span></h3><div className="tasks-list">{completed.map((t) => <article key={t.id} className="tasks-card completed">
        <div className="tasks-body"><div className="tasks-title-row"><strong>{t.title}</strong></div>{t.assigned_to ? <div className="tasks-meta"><span>{t.assigned_to}</span></div> : null}</div>
        <div className="tasks-actions"><button type="button" className="secondary-button" onClick={() => void reopenMut.mutate(t.id)}>Reopen</button></div>
      </article>)}</div></section>) : null}

    {formOpen ? <TaskForm initial={editing} employees={employees} onClose={() => { setFormOpen(false); setEditing(null); }} onSaved={() => { setFormOpen(false); setEditing(null); invalidate(); }} /> : null}
  </>;
}

function HelpView() {
  const [openId, setOpenId] = useState<string | null>("checkout");
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const guides = q
    ? HELP_GUIDES.filter((g) => (g.title + " " + g.summary + " " + g.steps.join(" ")).toLowerCase().includes(q))
    : HELP_GUIDES;
  return <>
    <section className="plain-command">
      <div>
        <p>HELP & TRAINING</p>
        <h1>How do I…?</h1>
      </div>
    </section>
    <section className="help-search">
      <SearchField value={search} onChange={setSearch} placeholder="Search guides — try “return” or “price”" label="Search help guides" />
    </section>
    {guides.length === 0 ? <div className="empty-state"><h2>No guides found</h2><p>Try a different search term.</p></div> : null}
    <div className="help-list">
      {guides.map((g) => {
        const open = openId === g.id;
        return <article key={g.id} className={`help-card ${open ? "open" : ""}`}>
          <button type="button" className="help-card-head" onClick={() => setOpenId(open ? null : g.id)} aria-expanded={open}>
            <span><strong>{g.title}</strong><small>{g.summary}</small></span>
            <ChevronIcon />
          </button>
          {open ? <div className="help-card-body">
            <ol>{g.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
            {g.tips?.length ? <div className="help-tips"><p>Good to know</p><ul>{g.tips.map((t, i) => <li key={i}>{t}</li>)}</ul></div> : null}
          </div> : null}
        </article>;
      })}
    </div>
    <p className="help-foot">Still stuck? Ask Randy or Nathan — they'd rather answer than fix a mistake later.</p>
  </>;
}

function UserManagementView() {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const users = useQuery({ queryKey: ["users"], queryFn: () => api.listUsers({}) });
  const [form, setForm] = useState({ username: "", displayName: "", password: "", role: "staff" as "admin" | "manager" | "staff" });
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState<"admin" | "manager" | "staff">("staff");
  const [resetPw, setResetPw] = useState("");

  if (currentUser?.role !== "admin") {
    return <section className="plain-command"><div><p>USERS</p><h1>User management</h1></div><p className="quiet-empty">Only admins can manage sign-in accounts.</p></section>;
  }

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["users"] });
  const create = useMutation({
    mutationFn: () => api.createUser({ username: form.username.trim(), displayName: form.displayName.trim(), password: form.password, role: form.role }),
    onSuccess: async (res) => {
      if (!res.ok) { setFormError(res.error ?? "Could not create the user."); return; }
      setForm({ username: "", displayName: "", password: "", role: "staff" });
      setFormError("");
      setNotice("User created \u2014 they can sign in with that username and password.");
      await refresh();
    },
    onError: () => setFormError("Could not create the user. Try again."),
  });
  const update = useMutation({
    mutationFn: (args: { id: number; displayName?: string; role?: "admin" | "manager" | "staff"; password?: string; active?: boolean }) => api.updateUser(args),
    onSuccess: async (res) => {
      if (!res.ok) { setNotice(res.error ?? "Could not update the user."); return; }
      setNotice("User updated.");
      setEditingId(null);
      setResetPw("");
      await refresh();
    },
    onError: () => setNotice("Could not update the user. Try again."),
  });
  const startEdit = (u: AppUser) => { setEditingId(u.id); setEditName(u.displayName); setEditRole(u.role as "admin" | "manager" | "staff"); setResetPw(""); setNotice(""); };
  const canCreate = form.username.trim().length >= 2 && form.displayName.trim().length >= 1 && form.password.length >= 8 && !create.isPending;

  return <>
    <section className="plain-command"><div><p>USERS</p><h1>User management</h1></div><span className="analytics-period">{users.data?.users.length ?? 0} accounts</span></section>
    <p className="field-intro">Sign-in accounts for the store app. Admins get everything including this screen, managers get everything except user management, and staff get the counter basics (checkout, field orders, returns) with no pricing or purchasing.</p>
    {notice ? <p className="settings-success" role="status">{notice}</p> : null}
    <section className="settings-panel user-create">
      <div className="settings-copy"><h2>Add a user</h2><p>Usernames are lowercase and unique. Passwords need at least 8 characters.</p></div>
      <form onSubmit={(event) => { event.preventDefault(); setFormError(""); if (canCreate) create.mutate(); }}>
        <div className="user-form-grid">
          <label><span>Username</span><input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="e.g. nathan" autoCapitalize="none" autoCorrect="off" /></label>
          <label><span>Display name</span><input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="e.g. Nathan Bretanha" /></label>
          <label><span>Password</span><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="At least 8 characters" autoComplete="new-password" /></label>
          <label><span>Role</span><select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as "admin" | "manager" | "staff" })}><option value="staff">Staff</option><option value="manager">Manager</option><option value="admin">Admin</option></select></label>
        </div>
        {formError ? <p className="form-error" role="alert">{formError}</p> : null}
        <button type="submit" className="primary-button" disabled={!canCreate}>{create.isPending ? "Creating\u2026" : "Create user"}</button>
      </form>
    </section>
    <section className="settings-panel">
      <div className="settings-copy"><h2>Accounts</h2><p>Edit a name or role, reset a password, or deactivate an account. You cannot demote or deactivate your own admin account.</p></div>
      {users.isPending ? <p className="quiet-empty">Loading users\u2026</p> : users.isError ? <p className="form-error">Could not load users. Try again.</p> : <div className="user-list">
        {users.data?.users.map((u) => <article key={u.id} className={`user-card ${u.active ? "" : "inactive"}`}>
          {editingId === u.id ? <div className="user-edit">
            <label><span>Display name</span><input value={editName} onChange={(e) => setEditName(e.target.value)} /></label>
            <label><span>Role</span><select value={editRole} onChange={(e) => setEditRole(e.target.value as "admin" | "manager" | "staff")}><option value="staff">Staff</option><option value="manager">Manager</option><option value="admin">Admin</option></select></label>
            <label><span>Reset password</span><input type="password" value={resetPw} onChange={(e) => setResetPw(e.target.value)} placeholder="Leave blank to keep" autoComplete="new-password" /></label>
            {resetPw && resetPw.length < 8 ? <p className="form-error">New password needs at least 8 characters.</p> : null}
            <div className="user-edit-actions">
              <button type="button" className="primary-button" disabled={update.isPending || !editName.trim() || (resetPw.length > 0 && resetPw.length < 8)} onClick={() => update.mutate({ id: u.id, displayName: editName.trim(), role: editRole, ...(resetPw.length >= 8 ? { password: resetPw } : {}) })}>{update.isPending ? "Saving\u2026" : "Save"}</button>
              <button type="button" className="secondary-button" onClick={() => { setEditingId(null); setResetPw(""); }}>Cancel</button>
            </div>
          </div> : <div className="user-card-main">
            <div><strong>{u.displayName}</strong><span>@{u.username} \u00b7 {u.role.charAt(0).toUpperCase() + u.role.slice(1)}{u.id === currentUser?.id ? " \u00b7 you" : ""}{u.active ? "" : " \u00b7 deactivated"}</span></div>
            <div className="user-card-actions">
              <button type="button" className="secondary-button user-small" onClick={() => startEdit(u)}>Edit</button>
              <button type="button" className="secondary-button user-small" disabled={u.id === currentUser?.id} title={u.id === currentUser?.id ? "You can't deactivate your own account" : u.active ? "Deactivate this account" : "Reactivate this account"} onClick={() => update.mutate({ id: u.id, active: !u.active })}>{u.active ? "Deactivate" : "Reactivate"}</button>
            </div>
          </div>}
        </article>)}
      </div>}
    </section>
  </>;
}

export function App() {
  const { user, logout } = useAuth();
  const [view, setView] = useState<View>("checkout");
  const [accountId, setAccountId] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem("rima-sidebar-collapsed") === "1"; } catch { return false; }
  });
  const toggleSidebar = () => {
    setSidebarCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem("rima-sidebar-collapsed", next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  };
  const fieldOrders = useQuery({ queryKey: ["field-orders"], queryFn: () => api.listFieldOrders({ status: "all", limit: 50 }) });
  const fieldDraftCount = fieldOrders.data?.draft_count ?? 0;
  const purchaseOrders = useQuery({ queryKey: ["purchase-orders"], queryFn: () => api.listPurchaseOrders({ limit: 50 }) });
  const poDraftCount = purchaseOrders.data?.draft_count ?? 0;
  const receiving = useQuery({ queryKey: ["receiving-documents"], queryFn: () => api.listReceivingDocuments({ limit: 25 }) });
  const receivingReviewCount = receiving.data?.needs_review_count ?? 0;
  const purchaseBadge = poDraftCount + receivingReviewCount;
  const viewLabels: Record<View, string> = { checkout: "Checkout", field: "Field Orders", tasks: "Tasks", products: "Products", customers: "Customers", inventory: "Inventory", orders: "Purchase", analytics: "Analytics", settings: "Settings", markup: "Markup Rules", team: "Sales Team", returns: "Returns", salesorders: "Orders", statements: "Statements", deposits: "Deposits", users: "Users", help: "Help & Training" };
  const go = (next: View) => { setView(next); setMenuOpen(false); };
  const navItem = (next: View, label: string, icon: ReactNode, badge = 0) => <button type="button" className={view === next ? "active" : ""} onClick={() => go(next)} aria-current={view === next ? "page" : undefined} aria-label={label} title={label}>{icon}<span>{label}</span>{badge > 0 ? <span className="nav-badge">{badge}</span> : null}</button>;
  return <div className={`app-shell${sidebarCollapsed ? " sidebar-is-collapsed" : ""}`}>
    <header className="brand-header"><img src={rimaLogo} alt="RIMA Supply Company" /></header>
    <div className="mobile-menu-bar">
      <button type="button" onClick={() => setMenuOpen(true)} aria-label="Open navigation menu"><MenuIcon /><span>Menu</span></button>
      <strong>{viewLabels[view]}</strong>
      {purchaseBadge > 0 && view !== "orders" ? <span className="nav-badge">{purchaseBadge}</span> : <span className="mobile-menu-spacer" />}
    </div>
    <div className="app-layout">
      {menuOpen ? <button type="button" className="sidebar-backdrop" aria-label="Close navigation menu" onClick={() => setMenuOpen(false)} /> : null}
      <aside className={`sidebar ${menuOpen ? "open" : ""} ${sidebarCollapsed ? "collapsed" : ""}`} aria-label="Sidebar">
        <div className="sidebar-head"><div><span>WORKSPACE</span><strong>Store operations</strong></div><button type="button" className="sidebar-close" onClick={() => setMenuOpen(false)} aria-label="Close navigation menu"><CloseIcon /></button></div>
        <nav className="sidebar-nav" aria-label="Main sections">
          <div className="sidebar-group"><p>Counter & field</p>{navItem("checkout", "Checkout", <CartIcon />)}{navItem("salesorders", "Orders", <FileIcon />)}{navItem("field", "Field Orders", <ClipboardIcon />, fieldDraftCount)}{navItem("tasks", "Tasks", <TasksIcon />)}{navItem("customers", "Customers", <UserIcon />)}{navItem("statements", "Statements", <MailIcon />)}</div>
          <div className="sidebar-group"><p>Stock & ordering</p>{navItem("products", "Products", <TagIcon />)}{navItem("inventory", "Inventory", <BoxIcon />)}{navItem("orders", "Purchase", <TruckIcon />, purchaseBadge)}</div>
          <div className="sidebar-group"><p>Business</p>{navItem("analytics", "Analytics", <ChartIcon />)}{navItem("deposits", "Deposits", <DepositIcon />)}{navItem("accounting", "Accounting", <AccountingIcon />)}{navItem("returns", "Returns", <ReturnIcon />)}{navItem("markup", "Markup Rules", <TagIcon />)}{navItem("team", "Sales Team", <UserIcon />)}{navItem("settings", "Settings", <SettingsIcon />)}{user?.role === "admin" ? navItem("users", "Users", <UserIcon />) : null}</div>
          <div className="sidebar-group"><p>Resources</p>{navItem("help", "Help & Training", <HelpIcon />)}</div>
        </nav>
        <div className="sidebar-user">
          <div className="sidebar-user-info"><UserIcon /><span><strong>{user?.displayName || user?.username || "Signed in"}</strong><small>{user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : ""}</small></span></div>
          <button type="button" className="sidebar-logout" onClick={() => void logout()}>Sign out</button>
        </div>
        <button type="button" className="sidebar-collapse-toggle" onClick={toggleSidebar} aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!sidebarCollapsed} title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}>
          {sidebarCollapsed ? <ExpandIcon /> : <CollapseIcon />}<span>{sidebarCollapsed ? "Expand" : "Collapse"}</span>
        </button>
      </aside>
      <main className="app-main">{view === "checkout" ? <CheckoutView onOpenCustomer={setAccountId} /> : view === "salesorders" ? <OrdersView onOpenCustomer={setAccountId} onOpenField={() => setView("field")} /> : view === "statements" ? <StatementsView onOpenCustomer={setAccountId} /> : view === "deposits" ? <DepositsView onOpenCustomer={setAccountId} /> : view === "field" ? <FieldOrdersView /> : view === "products" ? <ProductManagementView /> : view === "customers" ? <CustomersView /> : view === "inventory" ? <InventoryView /> : view === "orders" ? <PurchaseOrdersView /> : view === "analytics" ? <AnalyticsView /> : view === "markup" ? <MarkupRulesView /> : view === "team" ? <SalesTeamView /> : view === "returns" ? <ReturnsSummaryView /> : view === "users" ? <UserManagementView /> : view === "help" ? <HelpView /> : view === "tasks" ? <TasksView /> : view === "accounting" ? <AccountingView /> : <SettingsView />}</main>
    </div>
    {accountId !== null ? <AccountSheet id={accountId} onClose={() => setAccountId(null)} /> : null}
    <div id="rima-print-area" style={{ display: "none" }} aria-hidden="true" />
  </div>;
}
