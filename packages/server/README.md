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

-   **Port 3000 in use**: Check if another process is using port 3000.
-   **Connection Refused**: Ensure the server is actually running. The client expects it on `localhost:3000`.
-   **Web3 Errors**: Ensure you have a valid Internet connection, as the server may try to check chain state.
