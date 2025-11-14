import SwiftUI

struct MacAuthView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @State private var isLoginMode = true
    @State private var email = ""
    @State private var username = ""
    @State private var password = ""
    @State private var confirmPassword = ""
    @State private var selectedRole: UserRole = .player
    
    var body: some View {
        HStack(spacing: 0) {
            // Left side - Branding
            VStack(spacing: 20) {
                Spacer()
                
                Image(systemName: "shield.lefthalf.filled")
                    .font(.system(size: 120))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [.blue, .purple],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                
                Text("DandDy")
                    .font(.system(size: 56, weight: .bold, design: .rounded))
                
                Text("D&D Character Manager")
                    .font(.title3)
                    .foregroundColor(.secondary)
                
                Spacer()
                
                Text("Manage your D&D 5e characters and campaigns")
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .padding(.bottom, 40)
            }
            .frame(maxWidth: .infinity)
            .background(Color(NSColor.controlBackgroundColor))
            
            // Right side - Auth form
            VStack(spacing: 24) {
                VStack(spacing: 8) {
                    Text(isLoginMode ? "Welcome Back" : "Create Account")
                        .font(.title)
                        .fontWeight(.bold)
                    
                    Text(isLoginMode ? "Sign in to your account" : "Start your adventure")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
                .padding(.top, 60)
                
                VStack(spacing: 16) {
                    // Email
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Email")
                            .font(.caption)
                            .foregroundColor(.secondary)
                        TextField("email@example.com", text: $email)
                            .textFieldStyle(.roundedBorder)
                            .textContentType(.emailAddress)
                    }
                    
                    // Username (register only)
                    if !isLoginMode {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Username")
                                .font(.caption)
                                .foregroundColor(.secondary)
                            TextField("username", text: $username)
                                .textFieldStyle(.roundedBorder)
                                .textContentType(.username)
                        }
                    }
                    
                    // Password
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Password")
                            .font(.caption)
                            .foregroundColor(.secondary)
                        SecureField("••••••••", text: $password)
                            .textFieldStyle(.roundedBorder)
                            .textContentType(isLoginMode ? .password : .newPassword)
                    }
                    
                    // Confirm password (register only)
                    if !isLoginMode {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Confirm Password")
                                .font(.caption)
                                .foregroundColor(.secondary)
                            SecureField("••••••••", text: $confirmPassword)
                                .textFieldStyle(.roundedBorder)
                                .textContentType(.newPassword)
                        }
                        
                        // Role picker
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Role")
                                .font(.caption)
                                .foregroundColor(.secondary)
                            Picker("", selection: $selectedRole) {
                                Text("Player").tag(UserRole.player)
                                Text("Dungeon Master").tag(UserRole.dm)
                            }
                            .pickerStyle(.segmented)
                        }
                    }
                }
                .padding(.horizontal, 40)
                
                // Submit button
                Button(action: handleSubmit) {
                    if authViewModel.isLoading {
                        ProgressView()
                            .progressViewStyle(.circular)
                            .scaleEffect(0.8)
                    } else {
                        Text(isLoginMode ? "Sign In" : "Create Account")
                            .frame(maxWidth: .infinity)
                    }
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .padding(.horizontal, 40)
                .disabled(authViewModel.isLoading)
                
                // Toggle button
                Button(action: { isLoginMode.toggle() }) {
                    Text(isLoginMode ? "Don't have an account? Sign up" : "Already have an account? Sign in")
                        .font(.subheadline)
                }
                .buttonStyle(.plain)
                .foregroundColor(.blue)
                
                Spacer()
            }
            .frame(maxWidth: .infinity)
        }
        .alert("Error", isPresented: .constant(authViewModel.errorMessage != nil)) {
            Button("OK") {
                authViewModel.errorMessage = nil
            }
        } message: {
            Text(authViewModel.errorMessage ?? "")
        }
    }
    
    private func handleSubmit() {
        guard !email.isEmpty, !password.isEmpty else {
            authViewModel.errorMessage = "Please fill in all fields"
            return
        }
        
        if !isLoginMode {
            guard !username.isEmpty else {
                authViewModel.errorMessage = "Please enter a username"
                return
            }
            
            guard password == confirmPassword else {
                authViewModel.errorMessage = "Passwords don't match"
                return
            }
            
            guard password.count >= 6 else {
                authViewModel.errorMessage = "Password must be at least 6 characters"
                return
            }
        }
        
        Task {
            if isLoginMode {
                await authViewModel.login(email: email, password: password)
            } else {
                await authViewModel.register(email: email, username: username, password: password, role: selectedRole)
            }
        }
    }
}


