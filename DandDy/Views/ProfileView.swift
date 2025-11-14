import SwiftUI

struct ProfileView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    
    var body: some View {
        NavigationView {
            List {
                Section {
                    if let user = authViewModel.currentUser {
                        HStack {
                            Text("Username")
                            Spacer()
                            Text(user.username)
                                .foregroundColor(.secondary)
                        }
                        
                        HStack {
                            Text("Email")
                            Spacer()
                            Text(user.email)
                                .foregroundColor(.secondary)
                        }
                        
                        HStack {
                            Text("Role")
                            Spacer()
                            Text(user.role == .dm ? "Dungeon Master" : "Player")
                                .foregroundColor(.secondary)
                        }
                    }
                }
                
                Section {
                    Button(action: { authViewModel.logout() }) {
                        HStack {
                            Image(systemName: "rectangle.portrait.and.arrow.right")
                            Text("Logout")
                        }
                        .foregroundColor(.red)
                    }
                }
            }
            .navigationTitle("Profile")
        }
    }
}


