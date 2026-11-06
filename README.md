# PetCare Plus — database compatibility fix

This build fixes the database errors shown in the screenshots:

- `appointment_id` and `owner_id` are repaired to use `AUTO_INCREMENT`.
- `pet_id` is also checked and repaired so new pet records receive IDs automatically.
- The `species` column is added to an existing `pets` table when it is missing.
- The Node server checks and repairs these legacy table definitions before it starts accepting requests.

## Install/update

1. Extract this ZIP over your existing project, replacing the old files.
2. Open `server.js` and set the correct MySQL password (and username if it is not `root`).
3. Make sure MySQL is running and the `petcare_management` database exists. If it does not exist yet, import `database.sql` using phpMyAdmin or MySQL.
4. Stop the old Node server with `Ctrl+C`.
5. Run `npm install` (if needed), then `npm start`.
6. Open `http://localhost:3000` and refresh with `Ctrl+F5`.

The first startup checks the existing table structure and applies the missing auto-increment/column changes. The MySQL user must have permission to run `ALTER TABLE`. Existing records are preserved; do not drop your database.

Do not use Live Server or open the HTML files directly. The API requires the Node server.

## Pet photo backgrounds

Keep the `public/images` folder when copying or deploying the project. It contains the pet photos used throughout the website.
