# SNAPSHOT Game Server

The authoritative game server for SNAPSHOT.

## How to Run

1.  Navigate to the server directory:
    ```bash
    cd packages/server
    ```

2.  Install dependencies (if not already done in root):
    ```bash
    npm install
    ```

3.  Start the server:
    ```bash
    npm run start
    ```
    Or for development (auto-restart):
    ```bash
    npm run dev
    ```

## Troubleshooting

-   **Port in use**: Check if another process is using your configured `PORT` (default `10000` in production entrypoint).
-   **Connection Refused**: Ensure the server is actually running. In production, client uses same-origin unless `VITE_SERVER_URL` is set.
-   **Web3 Errors**: Ensure you have a valid Internet connection, as the server may try to check chain state.
