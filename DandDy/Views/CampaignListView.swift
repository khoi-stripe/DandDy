import SwiftUI

struct CampaignListView: View {
    @StateObject private var viewModel = CampaignViewModel()
    @EnvironmentObject var authViewModel: AuthViewModel
    @State private var showingCreateSheet = false
    
    var body: some View {
        NavigationView {
            ZStack {
                if viewModel.campaigns.isEmpty {
                    VStack(spacing: 20) {
                        Image(systemName: "map")
                            .font(.system(size: 60))
                            .foregroundColor(.gray)
                        
                        Text("No Campaigns")
                            .font(.title2)
                            .foregroundColor(.gray)
                        
                        if authViewModel.currentUser?.role == .dm {
                            Text("Create a campaign to organize your characters")
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                                .multilineTextAlignment(.center)
                                .padding(.horizontal)
                        } else {
                            Text("Join a campaign to see it here")
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                                .multilineTextAlignment(.center)
                                .padding(.horizontal)
                        }
                    }
                } else {
                    List {
                        ForEach(viewModel.campaigns) { campaign in
                            NavigationLink(destination: CampaignDetailView(campaignId: campaign.id)) {
                                CampaignRowView(campaign: campaign)
                            }
                        }
                        .onDelete(perform: authViewModel.currentUser?.role == .dm ? deleteCampaigns : nil)
                    }
                    .listStyle(InsetGroupedListStyle())
                }
            }
            .navigationTitle("Campaigns")
            .toolbar {
                if authViewModel.currentUser?.role == .dm {
                    ToolbarItem(placement: .navigationBarTrailing) {
                        Button(action: { showingCreateSheet = true }) {
                            Image(systemName: "plus")
                        }
                    }
                }
            }
            .sheet(isPresented: $showingCreateSheet) {
                CreateCampaignView(viewModel: viewModel, isPresented: $showingCreateSheet)
            }
            .task {
                await viewModel.loadCampaigns()
            }
            .refreshable {
                await viewModel.loadCampaigns()
            }
        }
    }
    
    private func deleteCampaigns(at offsets: IndexSet) {
        for index in offsets {
            let campaign = viewModel.campaigns[index]
            Task {
                await viewModel.deleteCampaign(id: campaign.id)
            }
        }
    }
}

struct CampaignRowView: View {
    let campaign: Campaign
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(campaign.name)
                .font(.headline)
            
            if let description = campaign.description, !description.isEmpty {
                Text(description)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .lineLimit(2)
            }
        }
        .padding(.vertical, 4)
    }
}

struct CreateCampaignView: View {
    @ObservedObject var viewModel: CampaignViewModel
    @Binding var isPresented: Bool
    @State private var name = ""
    @State private var description = ""
    
    var body: some View {
        NavigationView {
            Form {
                Section(header: Text("Campaign Details")) {
                    TextField("Campaign Name", text: $name)
                    
                    TextEditor(text: $description)
                        .frame(height: 100)
                }
            }
            .navigationTitle("New Campaign")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        isPresented = false
                    }
                }
                
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") {
                        Task {
                            let success = await viewModel.createCampaign(
                                name: name,
                                description: description.isEmpty ? nil : description
                            )
                            if success {
                                isPresented = false
                            }
                        }
                    }
                    .disabled(name.isEmpty)
                }
            }
        }
    }
}

struct CampaignDetailView: View {
    let campaignId: Int
    @StateObject private var viewModel = CampaignViewModel()
    
    var body: some View {
        Group {
            if let campaign = viewModel.selectedCampaign {
                List {
                    Section(header: Text("Details")) {
                        if let description = campaign.description, !description.isEmpty {
                            Text(description)
                        } else {
                            Text("No description")
                                .foregroundColor(.secondary)
                        }
                    }
                    
                    Section(header: Text("Characters")) {
                        if campaign.characters.isEmpty {
                            Text("No characters in this campaign yet")
                                .foregroundColor(.secondary)
                        } else {
                            ForEach(campaign.characters) { character in
                                NavigationLink(destination: CharacterSheetView(character: character)) {
                                    CharacterRowView(character: character)
                                }
                            }
                        }
                    }
                }
                .navigationTitle(campaign.name)
            } else {
                ProgressView()
                    .task {
                        await viewModel.loadCampaign(id: campaignId)
                    }
            }
        }
        .refreshable {
            await viewModel.loadCampaign(id: campaignId)
        }
    }
}


