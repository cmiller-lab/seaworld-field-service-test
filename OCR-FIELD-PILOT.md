# Calibration photo readings field pilot

Tesseract.js 6.0.1 and core 6.0.0 are pinned CDN dependencies, loaded only when scanning. English data is downloaded by Tesseract and cached in its IndexedDB. Initial scanner loading requires internet; reliable fully offline scanning is not guaranteed. There are no per-scan API charges. Photos, preview, and recognized text stay in browser memory and are not uploaded or saved to Supabase. Approved readings enter the existing spot-check fields and use the existing sync/offline queue without schema changes.

## Technician workflow

1. Open Calibration, choose Controller photo or Test kit photo.
2. Rotate sideways pictures and drag over the display to crop. Include metric labels; include controller location if pool recognition is needed.
3. Scan. Review editable readings and confirm the body of water. Missing or ambiguous fields stay blank. Only one uniquely matched pool is suggested.
4. Approve & apply readings. Only nonblank valid readings replace form fields; others remain unchanged. Test photos can be taken separately for pH and free chlorine. Always verify the selected pool belongs to the test photo.
5. Review all form values, enter anything missing manually, then Save.

Avoid glare and reflections; fill the frame with the screen. Free chlorine labels are required; total chlorine and setpoint rows are excluded. OCR may still produce plausible incorrect numbers. Approval is required and no reliability percentage is claimed. Pause text is flagged when recognized.

## Validation

Parser tests covered controller pH/ORP/free chlorine, Lumiso FCl2/pH labels, range annotations, conflicting readings, out-of-range readings, total chlorine, setpoints, and ambiguous pool matches. Mocked DOM tests verified no changes before approval, controller destination fields, atomic validation, discard, and clearing the preview after save. Real Tesseract scans of three uncropped sample photos did not reliably read the displays. Cropping/contrast and real mobile field performance require evaluation. No live database test records were created.
