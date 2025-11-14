import SwiftUI

struct ContentView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    
    var body: some View {
        Group {
            if authViewModel.isAuthenticated {
                MainTabView()
            } else {
                AuthView()
            }
        }
    }
}

struct MainTabView: View {
    var body: some View {
        TabView {
            CharacterListView()
                .tabItem {
                    Label("Characters", systemImage: "person.3.fill")
                }
            
            CampaignListView()
                .tabItem {
                    Label("Campaigns", systemImage: "map.fill")
                }
            
            ProfileView()
                .tabItem {
                    Label("Profile", systemImage: "person.circle.fill")
                }
        }
    }
}


