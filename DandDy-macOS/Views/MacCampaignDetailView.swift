import SwiftUI

struct MacCampaignDetailView: View {
    let campaignId: Int
    @StateObject private var viewModel = CampaignViewModel()
    
    var body: some View {
        Group {
            if let campaign = viewModel.selectedCampaign {
                VStack(spacing: 0) {
                    // Header
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(campaign.name)
                                .font(.title)
                                .fontWeight(.bold)
                            
                            if let description = campaign.description, !description.isEmpty {
                                Text(description)
                                    .font(.subheadline)
                                    .foregroundColor(.secondary)
                            }
                        }
                        
                        Spacer()
                        
                        Label("\(campaign.characters.count) Characters", systemImage: "person.3.fill")
                            .font(.headline)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 8)
                            .background(Color.blue.opacity(0.1))
                            .cornerRadius(8)
                    }
                    .padding()
                    .background(Color(NSColor.controlBackgroundColor))
                    
                    Divider()
                    
                    // Characters in campaign
                    ScrollView {
                        LazyVGrid(columns: [
                            GridItem(.flexible()),
                            GridItem(.flexible())
                        ], spacing: 16) {
                            ForEach(campaign.characters) { character in
                                CampaignCharacterCard(character: character)
                            }
                        }
                        .padding()
                    }
                }
            } else {
                ProgressView("Loading campaign...")
                    .task {
                        await viewModel.loadCampaign(id: campaignId)
                    }
            }
        }
    }
}

struct CampaignCharacterCard: View {
    let character: Character
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: classIcon(character.characterClass))
                    .font(.title)
                    .foregroundColor(.blue)
                
                Spacer()
                
                VStack(alignment: .trailing, spacing: 2) {
                    Text("Level \(character.level)")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Label("\(character.hitPointsCurrent)/\(character.hitPointsMax)", systemImage: "heart.fill")
                        .font(.caption)
                        .foregroundColor(hpColor)
                }
            }
            
            Text(character.name)
                .font(.headline)
            
            Text("\(character.race) \(character.characterClass)")
                .font(.subheadline)
                .foregroundColor(.secondary)
            
            Divider()
            
            HStack {
                StatBadge(label: "AC", value: "\(character.armorClass)")
                Spacer()
                StatBadge(label: "Init", value: "\(character.initiative >= 0 ? "+" : "")\(character.initiative)")
                Spacer()
                StatBadge(label: "Speed", value: "\(character.speed)")
            }
            .font(.caption)
        }
        .padding()
        .background(Color(NSColor.controlBackgroundColor))
        .cornerRadius(12)
    }
    
    private var hpColor: Color {
        let percentage = Double(character.hitPointsCurrent) / Double(character.hitPointsMax)
        if percentage > 0.5 { return .green }
        else if percentage > 0.25 { return .orange }
        else { return .red }
    }
    
    private func classIcon(_ className: String) -> String {
        switch className.lowercased() {
        case "barbarian": return "figure.wrestling"
        case "bard": return "music.note"
        case "cleric": return "cross.circle"
        case "druid": return "leaf.circle"
        case "fighter": return "shield.fill"
        case "monk": return "figure.martial.arts"
        case "paladin": return "shield.lefthalf.filled"
        case "ranger": return "arrow.up.right"
        case "rogue": return "theatermasks"
        case "sorcerer": return "sparkles"
        case "warlock": return "flame"
        case "wizard": return "book.circle"
        default: return "person.fill"
        }
    }
}

struct StatBadge: View {
    let label: String
    let value: String
    
    var body: some View {
        VStack(spacing: 2) {
            Text(label)
                .foregroundColor(.secondary)
            Text(value)
                .bold()
        }
    }
}


