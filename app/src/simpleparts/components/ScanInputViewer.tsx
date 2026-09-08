interface ScanPage {
  pageIndex: number
  mediaType: string
  imageBase64: string
}

interface ScanPart {
  pageIndex?: number
  nr?: string
  width: number
  height: number
  rotation?: number
}

export default function ScanInputViewer({
  pages = [],
  parts = [],
}: {
  pages?: ScanPage[]
  parts?: ScanPart[]
}) {
  return (
    <div className="scan-input-view">
      {pages.map((page) => {
        const pageParts = parts.filter((part) => (part.pageIndex ?? 0) === page.pageIndex)
        return (
          <div key={page.pageIndex} className="scan-page">
            <img
              className="scan-page-image"
              src={`data:${page.mediaType};base64,${page.imageBase64}`}
              alt={`Scan page ${page.pageIndex + 1}`}
            />
            {pageParts.length > 0 && (
              <ul className="scan-part-list">
                {pageParts.map((part, index) => (
                  <li key={`${part.nr ?? ''}:${index}`}>
                    {`${part.nr ? String(part.nr) : '?'} — ${part.width} × ${part.height} mm`}
                    {part.rotation ? <span className="scan-part-rotation"> ({part.rotation}°)</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}
