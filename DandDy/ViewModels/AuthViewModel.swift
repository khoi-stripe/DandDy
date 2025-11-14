import Foundation
import SwiftUI

@MainActor
class AuthViewModel: ObservableObject {
    @Published var isAuthenticated = false
    @Published var currentUser: User?
    @Published var errorMessage: String?
    @Published var isLoading = false
    
    private let authService = AuthService.shared
    
    init() {
        // Check if user has valid token on init
        checkAuthStatus()
    }
    
    func checkAuthStatus() {
        guard KeychainHelper.shared.getToken() != nil else {
            isAuthenticated = false
            return
        }
        
        Task {
            do {
                currentUser = try await authService.getCurrentUser()
                isAuthenticated = true
            } catch {
                // Token is invalid, clear it
                authService.logout()
                isAuthenticated = false
            }
        }
    }
    
    func register(email: String, username: String, password: String, role: UserRole) async {
        isLoading = true
        errorMessage = nil
        
        do {
            let user = try await authService.register(email: email, username: username, password: password, role: role)
            // Auto-login after registration
            _ = try await authService.login(email: email, password: password)
            currentUser = user
            isAuthenticated = true
        } catch {
            errorMessage = error.localizedDescription
        }
        
        isLoading = false
    }
    
    func login(email: String, password: String) async {
        isLoading = true
        errorMessage = nil
        
        do {
            _ = try await authService.login(email: email, password: password)
            currentUser = try await authService.getCurrentUser()
            isAuthenticated = true
        } catch {
            errorMessage = error.localizedDescription
        }
        
        isLoading = false
    }
    
    func logout() {
        authService.logout()
        currentUser = nil
        isAuthenticated = false
    }
}


