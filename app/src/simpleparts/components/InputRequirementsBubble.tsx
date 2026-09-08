import { createPortal } from 'react-dom'
import { useEffect, useRef, useState } from 'react'

const EXAMPLE_FILES = [
  ['2D DXF', 'SimplePartsInputExample2dDXF.dxf'],
  ['3D DXF', 'SimplePartsInputExample3dDXF.dxf'],
  ['2D DWG', 'SimplePartsInputExampleDWG.dwg'],
  ['3DM', 'SimplePartsInputExample3dm.3dm'],
] as const

export default function InputRequirementsBubble({ openTick = 0 }: { openTick?: number }) {
  const [requirementsOpen, setRequirementsOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const rootRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (openTick <= 0) return
    setRequirementsOpen(true)
    requestAnimationFrame(() => rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }))
  }, [openTick])

  useEffect(() => {
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (previewOpen) setPreviewOpen(false)
      else setRequirementsOpen(false)
    }
    window.addEventListener('keydown', onKeydown)
    document.body.style.overflow = requirementsOpen || previewOpen ? 'hidden' : ''
    return () => {
      window.removeEventListener('keydown', onKeydown)
      document.body.style.overflow = ''
    }
  }, [requirementsOpen, previewOpen])

  return (
    <article ref={rootRef} className="requirements-root">
      <div className="bubble-requirements">
        <button
          type="button"
          className="requirements-trigger"
          aria-haspopup="dialog"
          aria-expanded={requirementsOpen}
          onClick={() => setRequirementsOpen(true)}
        >
          Input file requirements
        </button>
      </div>
      {requirementsOpen && createPortal(
        <div className="requirements-modal" role="dialog" aria-modal="true" aria-labelledby="requirements-modal-title">
          <div className="requirements-modal__backdrop" onClick={() => setRequirementsOpen(false)} />
          <div className="requirements-modal__panel">
            <header className="requirements-modal__header">
              <h2 id="requirements-modal-title" className="requirements-modal__title">Input file requirements</h2>
              <button type="button" className="requirements-modal__close" aria-label="Close" onClick={() => setRequirementsOpen(false)}>×</button>
            </header>
            <div className="requirements-body">
              <p className="intro">For the pipeline to work, the input file needs to follow these format and geometrical requirements.</p>
              <section className="req-section req-section--downloads">
                <h3 className="req-heading">Downloads</h3>
                <div className="download-stack">
                  <a className="download-btn download-btn--primary" href="/input-requirements/input-requirements.pdf" download>Requirements PDF</a>
                  <button type="button" className="download-btn" onClick={() => setPreviewOpen(true)}>Preview template format</button>
                </div>
                <p className="examples-label">Example files</p>
                <div className="example-grid">
                  {EXAMPLE_FILES.map(([label, filename]) => (
                    <a key={filename} className="download-btn" href={`/input-requirements/${filename}`} download={filename}>{label}</a>
                  ))}
                </div>
              </section>
              <section className="req-section"><h3 className="req-heading">Admitted formats</h3><div className="format-badges"><span className="format-badge">.dxf</span><span className="format-badge">.3dm</span><span className="format-badge">.dwg</span></div></section>
              <section className="req-section"><h3 className="req-heading">Parts</h3><p>Files can contain both 2D curves or 3D geometry.</p><ul><li><strong>Curves:</strong> closed polylines, flattened to Z=0, with cuts made (boundaries within exterior boundaries).</li><li><strong>3D:</strong> geometry shall be mesh or brep.</li></ul></section>
              <section className="req-section"><h3 className="req-heading">Text / information</h3><p>Nesting uses metadata from text elements. You can also edit it in the app by clicking parts or via chat.</p><p>Place text next to the part (above/under) or inside it. Distant annotations yield incorrect results.</p><ul><li><strong>Name:</strong> serial numbers/codes. Redundant text is skipped by default.</li><li><strong>Amount:</strong> use <code>7x</code>, <code>7 Stk.</code> or <code>7 Stück</code> format. Defaults to 1 if omitted.</li><li><strong>Material:</strong> set directly on the app.</li></ul></section>
              <section className="req-section"><h3 className="req-heading">Layers</h3><p>Layers are ignored for computation. Prefer simple structures (e.g. boundaries layer, text layer) for faster processing.</p></section>
              <section className="req-section"><h3 className="req-heading">Other elements</h3><p>Annotations, dimensions and anything outside of curves, meshes, breps and text objects are disregarded. Blocks are not recognized: please explode any containing relevant geometry for processing.</p></section>
            </div>
          </div>
        </div>,
        document.body,
      )}
      {previewOpen && createPortal(
        <div className="template-modal" role="dialog" aria-modal="true" aria-labelledby="template-modal-title">
          <div className="template-modal__backdrop" onClick={() => setPreviewOpen(false)} />
          <div className="template-modal__panel">
            <header className="template-modal__header"><h2 id="template-modal-title" className="template-modal__title">Format template</h2><button type="button" className="template-modal__close" aria-label="Close" onClick={() => setPreviewOpen(false)}>×</button></header>
            <div className="template-modal__body"><img className="template-modal__image" src="/input-requirements/requirements3D.png" alt="Input file format template" /></div>
          </div>
        </div>,
        document.body,
      )}
    </article>
  )
}
