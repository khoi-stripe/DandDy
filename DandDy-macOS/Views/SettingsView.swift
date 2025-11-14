import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @AppStorage("apiBaseURL") private var apiBaseURL = "http://localhost:8000"
    @State private var tempURL = ""
    
    var body: some View {
        TabView {
            // General Settings
            Form {
                Section {
                    TextField("API Base URL", text: $tempURL)
                        .onAppear {
                            tempURL = apiBaseURL
                        }
                    
                    HStack {
                        Button("Reset to Default") {
                            tempURL = "http://localhost:8000"
                        }
                        
                        Spacer()
                        
                        Button("Save") {
                            apiBaseURL = tempURL
                        }
                        .buttonStyle(.borderedProminent)
                    }
                } header: {
                    Text("API Configuration")
                } footer: {
                    Text("Configure the backend API endpoint. Use localhost:8000 for local development.")
                }
                
                Section {
                    if let user = authViewModel.currentUser {
                        LabeledContent("Username", value: user.username)
                        LabeledContent("Email", value: user.email)
                        LabeledContent("Role", value: user.role == .dm ? "Dungeon Master" : "Player")
                    }
                } header: {
                    Text("Account")
                }
            }
            .formStyle(.grouped)
            .frame(width: 450, height: 300)
            .tabItem {
                Label("General", systemImage: "gear")
            }
            
            // About
            VStack(spacing: 20) {
                Image(systemName: "shield.lefthalf.filled")
                    .font(.system(size: 64))
                    .foregroundColor(.blue)
                
                Text("DandDy")
                    .font(.title)
                    .fontWeight(.bold)
                
                Text("D&D 5e Character Manager")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                
                Text("Version 1.0")
                    .font(.caption)
                    .foregroundColor(.secondary)
                
                Divider()
                    .padding(.horizontal, 40)
                
                VStack(spacing: 8) {
                    Text("Manage your Dungeons & Dragons characters,")
                    Text("track combat, inventory, and campaigns.")
                }
                .font(.caption)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
            }
            .frame(width: 450, height: 300)
            .tabItem {
                Label("About", systemImage: "info.circle")
            }
        }
        .padding()
    }
}


