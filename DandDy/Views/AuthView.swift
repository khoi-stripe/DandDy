import SwiftUI

struct AuthView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @State private var isLoginMode = true
    @State private var email = ""
    @State private var username = ""
    @State private var password = ""
    @State private var confirmPassword = ""
    @State private var selectedRole: UserRole = .player
    @State private var showingAlert = false
    
    var body: some View {
        NavigationView {
            ZStack {
                // Background gradient
                LinearGradient(
                    colors: [Color.blue.opacity(0.6), Color.purple.opacity(0.6)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                .ignoresSafeArea()
                
                ScrollView {
                    VStack(spacing: 25) {
                        // Logo and title
                        VStack(spacing: 10) {
                            Image(systemName: "shield.lefthalf.filled")
                                .font(.system(size: 80))
                                .foregroundColor(.white)
                            
                            Text("DandDy")
                                .font(.system(size: 48, weight: .bold, design: .rounded))
                                .foregroundColor(.white)
                            
                            Text("D&D Character Manager")
                                .font(.subheadline)
                                .foregroundColor(.white.opacity(0.9))
                        }
                        .padding(.top, 60)
                        .padding(.bottom, 20)
                        
                        // Form
                        VStack(spacing: 20) {
                            // Email field
                            TextField("Email", text: $email)
                                .textContentType(.emailAddress)
                                .autocapitalization(.none)
                                .keyboardType(.emailAddress)
                                .padding()
                                .background(Color.white)
                                .cornerRadius(10)
                            
                            // Username field (register only)
                            if !isLoginMode {
                                TextField("Username", text: $username)
                                    .textContentType(.username)
                                    .autocapitalization(.none)
                                    .padding()
                                    .background(Color.white)
                                    .cornerRadius(10)
                            }
                            
                            // Password field
                            SecureField("Password", text: $password)
                                .textContentType(isLoginMode ? .password : .newPassword)
                                .padding()
                                .background(Color.white)
                                .cornerRadius(10)
                            
                            // Confirm password (register only)
                            if !isLoginMode {
                                SecureField("Confirm Password", text: $confirmPassword)
                                    .textContentType(.newPassword)
                                    .padding()
                                    .background(Color.white)
                                    .cornerRadius(10)
                                
                                // Role picker
                                Picker("Role", selection: $selectedRole) {
                                    Text("Player").tag(UserRole.player)
                                    Text("Dungeon Master").tag(UserRole.dm)
                                }
                                .pickerStyle(SegmentedPickerStyle())
                                .padding()
                                .background(Color.white)
                                .cornerRadius(10)
                            }
                            
                            // Submit button
                            Button(action: handleSubmit) {
                                if authViewModel.isLoading {
                                    ProgressView()
                                        .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                } else {
                                    Text(isLoginMode ? "Login" : "Register")
                                        .font(.headline)
                                        .foregroundColor(.white)
                                }
                            }
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(Color.blue)
                            .cornerRadius(10)
                            .disabled(authViewModel.isLoading)
                            
                            // Toggle mode button
                            Button(action: { isLoginMode.toggle() }) {
                                Text(isLoginMode ? "Don't have an account? Register" : "Already have an account? Login")
                                    .font(.subheadline)
                                    .foregroundColor(.white)
                            }
                        }
                        .padding(.horizontal, 30)
                        
                        Spacer()
                    }
                }
            }
            .alert("Error", isPresented: .constant(authViewModel.errorMessage != nil)) {
                Button("OK") {
                    authViewModel.errorMessage = nil
                }
            } message: {
                Text(authViewModel.errorMessage ?? "")
            }
        }
    }
    
    private func handleSubmit() {
        // Validation
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


