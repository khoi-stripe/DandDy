import SwiftUI

struct MacContentView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    
    var body: some View {
        Group {
            if authViewModel.isAuthenticated {
                MacMainView()
            } else {
                MacAuthView()
            }
        }
    }
}

struct MacMainView: View {
    @StateObject private var characterViewModel = CharacterViewModel()
    @StateObject private var campaignViewModel = CampaignViewModel()
    @State private var selectedView: SidebarSelection = .characters
    @State private var selectedCharacter: Character?
    @State private var selectedCampaign: Campaign?
    @State private var showingNewCharacter = false
    @State private var showingNewCampaign = false
    
    enum SidebarSelection {
        case characters
        case campaigns
        case profile
    }
    
    var body: some View {
        NavigationSplitView {
            // Sidebar
            List(selection: $selectedView) {
                Section("Main") {
                    Label("Characters", systemImage: "person.3.fill")
                        .tag(SidebarSelection.characters)
                    
                    Label("Campaigns", systemImage: "map.fill")
                        .tag(SidebarSelection.campaigns)
                }
                
                Section("Account") {
                    Label("Profile", systemImage: "person.circle.fill")
                        .tag(SidebarSelection.profile)
                }
            }
            .navigationSplitViewColumnWidth(min: 200, ideal: 220)
            .toolbar {
                ToolbarItem(placement: .navigation) {
                    Button(action: toggleSidebar) {
                        Image(systemName: "sidebar.left")
                    }
                }
            }
        } content: {
            // Content list
            Group {
                switch selectedView {
                case .characters:
                    CharacterListPanel(
                        viewModel: characterViewModel,
                        selectedCharacter: $selectedCharacter,
                        showingNewCharacter: $showingNewCharacter
                    )
                    
                case .campaigns:
                    CampaignListPanel(
                        viewModel: campaignViewModel,
                        selectedCampaign: $selectedCampaign,
                        showingNewCampaign: $showingNewCampaign
                    )
                    
                case .profile:
                    MacProfilePanel()
                }
            }
            .navigationSplitViewColumnWidth(min: 250, ideal: 300)
        } detail: {
            // Detail view
            Group {
                switch selectedView {
                case .characters:
                    if let character = selectedCharacter {
                        MacCharacterDetailView(character: character)
                    } else {
                        EmptyDetailView(
                            icon: "person.fill",
                            title: "No Character Selected",
                            subtitle: "Select a character from the list or create a new one"
                        )
                    }
                    
                case .campaigns:
                    if let campaign = selectedCampaign {
                        MacCampaignDetailView(campaignId: campaign.id)
                    } else {
                        EmptyDetailView(
                            icon: "map.fill",
                            title: "No Campaign Selected",
                            subtitle: "Select a campaign from the list"
                        )
                    }
                    
                case .profile:
                    EmptyDetailView(
                        icon: "person.circle.fill",
                        title: "Profile",
                        subtitle: "Your account information is shown in the panel"
                    )
                }
            }
            .navigationSplitViewColumnWidth(min: 500, ideal: 700)
        }
        .sheet(isPresented: $showingNewCharacter) {
            CharacterCreationView(viewModel: characterViewModel, isPresented: $showingNewCharacter)
                .frame(minWidth: 700, minHeight: 600)
        }
        .sheet(isPresented: $showingNewCampaign) {
            CreateCampaignView(viewModel: campaignViewModel, isPresented: $showingNewCampaign)
                .frame(width: 500, height: 400)
        }
        .onReceive(NotificationCenter.default.publisher(for: .newCharacter)) { _ in
            if selectedView == .characters {
                showingNewCharacter = true
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .newCampaign)) { _ in
            if selectedView == .campaigns {
                showingNewCampaign = true
            }
        }
        .task {
            await characterViewModel.loadCharacters()
            await campaignViewModel.loadCampaigns()
        }
    }
    
    private func toggleSidebar() {
        NSApp.keyWindow?.firstResponder?.tryToPerform(#selector(NSSplitViewController.toggleSidebar(_:)), with: nil)
    }
}

struct EmptyDetailView: View {
    let icon: String
    let title: String
    let subtitle: String
    
    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: icon)
                .font(.system(size: 64))
                .foregroundColor(.secondary)
            
            Text(title)
                .font(.title2)
                .fontWeight(.semibold)
            
            Text(subtitle)
                .font(.body)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}


