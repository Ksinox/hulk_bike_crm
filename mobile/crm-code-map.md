# Hulk Bike CRM mobile code map

Source of truth before mobile design changes:

- `apps/web/src/app/route.ts` and `apps/web/src/app/App.tsx` define ready user routes.
- `apps/web/src/app/Sidebar.tsx` defines visible navigation and "soon" sections.
- `apps/web/src/lib/api/*.ts` defines frontend-supported operations.
- `apps/api/src/routes/*.ts` defines server-supported operations.

Ready user-facing routes in the web CRM:

- `dashboard`: revenue, fleet state, returns, overdue rentals, applications, activity, global search, quick create.
- `clients`: client list, filters, add/edit client, client card, documents, applications linked to client, create deal entry.
- `applications`: public client applications, new/viewed/accepted/rejected/spam states, view, convert, reject, spam, restore.
- `rentals`: active/archive rental lists, create rental, rental card, accept payment, extend rental, complete return, damage report, swap scooter, equipment changes, documents, debt actions.
- `fleet`: garage/fleet list, scooter card, add/edit scooter, status change, model catalog, equipment catalog, maintenance, documents/photos, archive/restore/purge.
- `service`: active/completed repair jobs, progress checklist, add price-list items, photo upload/delete, complete repair.
- `docs`: system and custom document templates, variable catalog, template editor, save/delete overrides.
- `staff`: user list, create user, edit role/status/color, reset password. Visible only to creator/director.
- `settings`: global app settings such as work hours and billing period.
- `whats-new`: changelog surface.

Sidebar "soon" sections, not ready as full pages:

- `rassrochki`
- `sales`
- `incidents`
- `analytics`

Important boundary:

- `tasks` exists as backend/table legacy support, but it is not a ready user-facing route in current app navigation. Do not design it as a mobile module unless the desktop CRM exposes it again.
