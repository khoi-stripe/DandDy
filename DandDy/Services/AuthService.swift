import Foundation

class AuthService {
    static let shared = AuthService()
    private init() {}
    
    private let apiClient = APIClient.shared
    
    func register(email: String, username: String, password: String, role: UserRole) async throws -> User {
        let userData = UserCreate(email: email, username: username, password: password, role: role)
        let user: User = try await apiClient.request(
            endpoint: "/auth/register",
            method: "POST",
            body: userData,
            requiresAuth: false
        )
        return user
    }
    
    func login(email: String, password: String) async throws -> String {
        let credentials = UserLogin(email: email, password: password)
        let tokenResponse: TokenResponse = try await apiClient.request(
            endpoint: "/auth/login",
            method: "POST",
            body: credentials,
            requiresAuth: false
        )
        
        // Save token to keychain
        KeychainHelper.shared.save(token: tokenResponse.accessToken)
        
        return tokenResponse.accessToken
    }
    
    func getCurrentUser() async throws -> User {
        let user: User = try await apiClient.request(endpoint: "/auth/me")
        return user
    }
    
    func logout() {
        KeychainHelper.shared.deleteToken()
    }
}


