import SwiftUI

struct CampaignListPanel: View {
    @ObservedObject var viewModel: CampaignViewModel
    @Binding var selectedCampaign: Campaign?
    @Binding var showingNewCampaign: Bool
    @EnvironmentObject var authViewModel: AuthViewModel
    
    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                Text("Campaigns")
                    .font(.title2)
                    .fontWeight(.bold)
                
                Spacer()
                
                if authViewModel.currentUser?.role == .dm {
                    Button(action: { showingNewCampaign = true }) {
                        Image(systemName: "plus")
                    }
                    .buttonStyle(.borderless)
                }
            }
            .padding()
            
            Divider()
            
            // Campaign list
            if viewModel.campaigns.isEmpty {
                VStack(spacing: 12) {
                    Image(systemName: "map")
                        .font(.system(size: 48))
                        .foregroundColor(.secondary)
                    
                    Text("No Campaigns")
                        .font(.headline)
                        .foregroundColor(.secondary)
                    
                    if authViewModel.currentUser?.role == .dm {
                        Text("Create your first campaign")
                            .font(.caption)
                            .foregroundColor(.secondary)
                        
                        Button("New Campaign") {
                            showingNewCampaign = true
                        }
                        .buttonStyle(.borderedProminent)
                    } else {
                        Text("Join a campaign to see it here")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List(viewModel.campaigns, selection: $selectedCampaign) { campaign in
                    CampaignListItemView(campaign: campaign)
                        .tag(campaign)
                        .contextMenu {
                            if authViewModel.currentUser?.role == .dm {
                                Button("Delete", role: .destructive) {
                                    Task {
                                        await viewModel.deleteCampaign(id: campaign.id)
                                        if selectedCampaign?.id == campaign.id {
                                            selectedCampaign = nil
                                        }
                                    }
                                }
                            }
                        }
                }
                .listStyle(.sidebar)
            }
        }
        .task {
            if viewModel.campaigns.isEmpty {
                await viewModel.loadCampaigns()
            }
        }
        .toolbar {
            ToolbarItem(placement: .automatic) {
                Button(action: { Task { await viewModel.loadCampaigns() } }) {
                    Image(systemName: "arrow.clockwise")
                }
            }
        }
    }
}

struct CampaignListItemView: View {
    let campaign: Campaign
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: "map.fill")
                    .foregroundColor(.blue)
                
                Text(campaign.name)
                    .font(.headline)
            }
            
            if let description = campaign.description, !description.isEmpty {
                Text(description)
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .lineLimit(2)
            }
        }
        .padding(.vertical, 4)
    }
}


