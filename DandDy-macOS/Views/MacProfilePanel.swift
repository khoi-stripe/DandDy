import SwiftUI

struct MacProfilePanel: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    
    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                Text("Profile")
                    .font(.title2)
                    .fontWeight(.bold)
                
                Spacer()
            }
            .padding()
            
            Divider()
            
            // Content
            if let user = authViewModel.currentUser {
                VStack(spacing: 20) {
                    // User icon
                    Image(systemName: "person.circle.fill")
                        .font(.system(size: 80))
                        .foregroundColor(.blue)
                        .padding(.top, 40)
                    
                    // User info
                    VStack(spacing: 12) {
                        VStack(spacing: 4) {
                            Text(user.username)
                                .font(.title2)
                                .fontWeight(.bold)
                            
                            Text(user.email)
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                        }
                        
                        // Role badge
                        HStack {
                            Image(systemName: user.role == .dm ? "shield.lefthalf.filled" : "person.fill")
                            Text(user.role == .dm ? "Dungeon Master" : "Player")
                        }
                        .font(.caption)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(user.role == .dm ? Color.purple.opacity(0.2) : Color.blue.opacity(0.2))
                        .cornerRadius(8)
                    }
                    
                    Spacer()
                    
                    // Logout button
                    Button(action: { authViewModel.logout() }) {
                        HStack {
                            Image(systemName: "rectangle.portrait.and.arrow.right")
                            Text("Sign Out")
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .tint(.red)
                    .padding()
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
    }
}


