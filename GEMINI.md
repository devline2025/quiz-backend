# GEMINI.md

This file serves as the instructional context and repository documentation for Gemini CLI. It outlines the project's architecture, dependencies, operational instructions, API reference, and development conventions.

---

## 1. Project Overview

`quiz-backend` is a lightweight Node.js/Express API server designed to power quiz or survey applications. It handles storing real-time user quiz answers into a PostgreSQL database and allocates unique vouchers to users from a Google Sheets spreadsheet.

### Key Technologies
*   **Node.js**: Server-side JavaScript runtime (v18+ recommended).
*   **Express** (v5.1.x): Web framework for routing and middleware.
*   **PostgreSQL** (via `pg` v8.16.x): Database for persisting answers.
*   **Google Sheets API** (via `googleapis` v160.0.x): Remote spreadsheet integration for voucher management.

---

## 2. Architecture & File Structure

The project has a highly focused, flat structure:
*   `server.js`: The central entry point containing all middleware, API routes, database pools, and external service clients.
*   `credentials.json`: **(Git Ignored)** Google Service Account private key file required for accessing Google Sheets.
*   `package.json`: Manages metadata, dependencies, and start scripts.
*   `package-lock.json`: Locks dependency tree.

---

## 3. Configuration & Environment Variables

The application is configured using environment variables. Default values are fallback-defined in `server.js` for local development.

| Variable Name | Description | Default / Fallback |
| :--- | :--- | :--- |
| `PORT` | The port on which the Express server listens. | `3000` |
| `DATABASE_URL` | PostgreSQL connection connection URI. | `postgresql://huang@localhost:5432/quizdatabase` |
| `API_KEY` | Header key used to authorize API requests. | `3jnDfg4nw0wSDkb4295NBJkdwhuf378S` |

### Database Initialization

To support the recording of answers, ensure your PostgreSQL database has a table matching the following schema:

```sql
CREATE TABLE quiz_answers (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    session_id VARCHAR(255) NOT NULL,
    question_id VARCHAR(255) NOT NULL,
    selected_option VARCHAR(255) NOT NULL,
    is_correct BOOLEAN NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Google Sheets Integration

The voucher system connects to a Google Sheets document:
*   **Spreadsheet ID:** `1CFfrKznsAXW3o2llGnAhDNdEl4atzhHBIFNt_8uBl90`
*   **Sheet/Range:** `小測驗禮卷!A:E`
*   **Authentication:** Requires a service account key file named `credentials.json` in the root directory with Sheets write permission.
*   **Schema Expected in Google Sheets:**
    *   **Column A (`id` / index 0):** Unique identifier of the voucher entry.
    *   **Column B (`voucher_url` / index 1):** The URL link to redeem the voucher.
    *   **Column C (`code` / index 2):** Unique redemption code.
    *   **Column D (`used` / index 3):** Marked as `"FALSE"` if available, and `"TRUE"` when claimed.
    *   **Column E (`user_id` / index 4):** Filled with the claimant's `user_id` upon successful claim.
    *   **Column F (index 5):** Updated with the claiming ISO timestamp during redemption.

---

## 4. Security & CORS

### Request Security
A custom middleware enforces that **every incoming request** (except preflight `OPTIONS` requests) must include the `x-api-key` header matching the active `API_KEY` value. If missing or incorrect, a `403 Forbidden` response is returned.

### CORS Settings
Cross-Origin Resource Sharing is enabled for specific origins:
*   `http://127.0.0.1:5501`
*   `http://localhost:5501`
*   `https://devline2025.github.io`
*   **Allowed Methods:** `GET`, `POST`, `OPTIONS`

---

## 5. API Reference

All requests must be accompanied by the header: `x-api-key: <API_KEY>`

### 1. Health Check
*   **Route:** `GET /`
*   **Description:** Verifies that the API server is active.
*   **Response:**
    *   **Status:** `200 OK`
    *   **Body:** `"Quiz backend is running 🚀"`

### 2. Submit Quiz Answer
*   **Route:** `POST /answers`
*   **Description:** Records a single question response in the PostgreSQL database.
*   **Content-Type:** `application/json`
*   **Payload Schema:**
    ```json
    {
      "user_id": "user123",
      "session_id": "sess_abc",
      "question_id": "q_01",
      "selected_option": "B",
      "is_correct": true
    }
    ```
*   **Response:**
    *   **Status:** `200 OK`
    *   **Body:** JSON object representing the newly created record in `quiz_answers`.

### 3. Retrieve All Answers
*   **Route:** `GET /answers`
*   **Description:** Retrieves all recorded quiz answers from the database.
*   **Response:**
    *   **Status:** `200 OK`
    *   **Body:** Array of answer objects sorted by `id DESC`.

### 4. Claim Voucher
*   **Route:** `POST /getVoucher`
*   **Description:** Allocates an unassigned voucher URL and code to a specified user. If the user already claimed a voucher, returns the existing details.
*   **Content-Type:** `application/json`
*   **Payload Schema:**
    ```json
    {
      "user_id": "user123"
    }
    ```
*   **Response (New/Existing Claim):**
    *   **Status:** `200 OK`
    *   **Body:**
        ```json
        {
          "url": "https://example.com/voucher/redemption-url",
          "code": "CLAIMCODE2026"
        }
        ```
*   **Response (No Vouchers Left):**
    *   **Status:** `200 OK`
    *   **Body:**
        ```json
        {
          "error": "❌ 沒有剩餘的禮卷了"
        }
        ```

---

## 6. Building and Running

### Prerequisites
1.  **Node.js**: v18+ installed.
2.  **PostgreSQL**: A running instance with database `quizdatabase`.
3.  **Google Sheets Setup**: Download your Google Service Account key file and place it in the project root as `credentials.json`.

### CLI Commands

*   **Install Dependencies:**
    ```bash
    npm install
    ```

*   **Run Server (Development / Production):**
    ```bash
    npm start
    ```
    The server will startup and run on `http://localhost:<PORT>` (default `3000`).

---

## 7. Development Conventions

*   **CommonJS Modules**: All files must use standard `require` syntax (not ESM `import`).
*   **Linting & Style**: No linter is currently pre-configured. Maintain the existing formatting conventions (double quotes for strings, 2-space indentation).
*   **Testing**: Currently, no test framework is initialized. If adding integration tests, consider using `Supertest` alongside a test runner (e.g., `jest` or `mocha`).
*   **Safety Precaution**: Never commit production environmental credentials, `.env` files, or the `credentials.json` secret key file. Double-check `.gitignore` before performing any commits.
