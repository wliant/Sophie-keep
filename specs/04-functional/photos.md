# Photos

## Purpose

A picture disambiguates items ("which box of tea is this?") and helps when shopping for replacements. Photos are attached to items and stored locally on the server — never uploaded elsewhere.

## Scope

- In scope: uploading, displaying, reordering, and deleting photos on items; background image for the floor plan.
- Out of scope: image recognition; auto-tagging; cloud storage; cross-item galleries.

## Requirements

### Upload

- **FR-PHOTOS-001**: The system must allow uploading one or more photos when creating or editing an item.
- **FR-PHOTOS-002**: Accepted MIME types: `image/jpeg`, `image/png`, `image/webp`. Requests with any other MIME type must be rejected.
- **FR-PHOTOS-003**: Maximum file size per photo: **10 MB**. Over-size uploads must be rejected with a specific error code (see `../09-validation-and-errors.md`).
- **FR-PHOTOS-004**: The system must generate and store a thumbnail (≤ 512 px on the longest side) alongside the original. Thumbnails are derived; a failure to generate must fall back to serving the original.
- **FR-PHOTOS-005**: Photos are stored in an S3-compatible object store (MinIO by default); the database holds only the reference metadata defined by the [Photo](../03-domain-model.md#photo) entity. See `07-data-and-storage.md` for object key layout and configuration.
- **FR-PHOTOS-006**: Uploads must strip EXIF metadata except for orientation (which is applied and then removed). This prevents unintended sharing of geolocation in backups.

### Display

- **FR-PHOTOS-010**: Item detail must render all photos of an item as a gallery. Tapping opens a lightbox.
- **FR-PHOTOS-011**: Inventory list rows must render the first photo's thumbnail when present; otherwise a placeholder icon.
- **FR-PHOTOS-012**: The gallery must support reordering (drag on desktop, handle-drag on mobile). The order is stored as the sequence of `Item.photo_ids`.

### Delete

- **FR-PHOTOS-020**: The system must allow deleting individual photos from an item.
- **FR-PHOTOS-021**: Deleting an item must cascade-delete all its photos (database rows **and** objects in the object store, including thumbnails).
- **FR-PHOTOS-022**: A deleted photo must be removed from any backup created **after** the deletion. Existing backups retain the historical photo.

### Floor plan background

- **FR-PHOTOS-030**: The same photo storage must support floor-plan background images as described in `floor-plan.md` (`FR-PLAN-015`). These are stored with `owner_kind=floor_plan`.

## UX Notes

- The item-edit screen has a camera/upload button that opens the device's native picker (supports camera capture on mobile).
- Upload progress is shown per-photo.
- Photos failing validation are reported inline with the rejected file name and reason.
- The lightbox supports pinch-to-zoom on mobile.

## Dependencies

- Entity: [Photo](../03-domain-model.md#photo), [Item](../03-domain-model.md#item), [FloorPlan](../03-domain-model.md#floorplan).
- Storage layout: `../07-data-and-storage.md`.
- Backup behavior: `backup-restore.md`.

## Acceptance Criteria

- **AC-PHOTOS-001**: **Given** an item has no photos, **when** a user uploads a 2 MB JPEG, **then** the photo is stored, a thumbnail is generated, and the item's `photo_ids` contains the new id.
- **AC-PHOTOS-002**: **Given** a user attempts to upload a 15 MB PNG, **when** the request is submitted, **then** it is rejected with a size-limit error and nothing is stored.
- **AC-PHOTOS-003**: **Given** a user attempts to upload a `video/mp4`, **when** the request is submitted, **then** it is rejected with a MIME-type error.
- **AC-PHOTOS-004**: **Given** an item with 3 photos, **when** the user deletes the middle photo, **then** `photo_ids` contains only the remaining two in original order, and the deleted file and its thumbnail no longer exist on disk.
- **AC-PHOTOS-005**: **Given** an item with 2 photos, **when** the item is deleted, **then** both photo rows are gone and no photo files remain under the photo root for that item.
- **AC-PHOTOS-006**: **Given** a JPEG with GPS EXIF data is uploaded, **when** the stored file is inspected, **then** GPS EXIF is absent.

## Open Questions

- `OI-014`: Whether to support HEIC (iPhone default). v1 requires users to allow the browser/OS to convert to JPEG on upload. Parked.
