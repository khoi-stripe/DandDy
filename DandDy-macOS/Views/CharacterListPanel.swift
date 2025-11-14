import SwiftUI

struct CharacterListPanel: View {
    @ObservedObject var viewModel: CharacterViewModel
    @Binding var selectedCharacter: Character?
    @Binding var showingNewCharacter: Bool
    
    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                Text("Characters")
                    .font(.title2)
                    .fontWeight(.bold)
                
                Spacer()
                
                Button(action: { showingNewCharacter = true }) {
                    Image(systemName: "plus")
                }
                .buttonStyle(.borderless)
            }
            .padding()
            
            Divider()
            
            // Character list
            if viewModel.characters.isEmpty {
                VStack(spacing: 12) {
                    Image(systemName: "person.3")
                        .font(.system(size: 48))
                        .foregroundColor(.secondary)
                    
                    Text("No Characters")
                        .font(.headline)
                        .foregroundColor(.secondary)
                    
                    Text("Create your first character")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    
                    Button("New Character") {
                        showingNewCharacter = true
                    }
                    .buttonStyle(.borderedProminent)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List(viewModel.characters, selection: $selectedCharacter) { character in
                    CharacterListItemView(character: character)
                        .tag(character)
                        .contextMenu {
                            Button("Delete", role: .destructive) {
                                Task {
                                    await viewModel.deleteCharacter(id: character.id)
                                    if selectedCharacter?.id == character.id {
                                        selectedCharacter = nil
                                    }
                                }
                            }
                        }
                }
                .listStyle(.sidebar)
            }
        }
        .task {
            if viewModel.characters.isEmpty {
                await viewModel.loadCharacters()
            }
        }
        .toolbar {
            ToolbarItem(placement: .automatic) {
                Button(action: { Task { await viewModel.loadCharacters() } }) {
                    Image(systemName: "arrow.clockwise")
                }
            }
        }
    }
}

struct CharacterListItemView: View {
    let character: Character
    
    var body: some View {
        HStack(spacing: 12) {
            // Class icon
            Image(systemName: classIcon(character.characterClass))
                .font(.title3)
                .foregroundColor(.blue)
                .frame(width: 32, height: 32)
            
            VStack(alignment: .leading, spacing: 4) {
                Text(character.name)
                    .font(.headline)
                
                Text("\(character.race) \(character.characterClass)")
                    .font(.caption)
                    .foregroundColor(.secondary)
                
                HStack(spacing: 8) {
                    Label("Lv \(character.level)", systemImage: "star.fill")
                        .font(.caption2)
                        .foregroundColor(.orange)
                    
                    Label("\(character.hitPointsCurrent)/\(character.hitPointsMax)", systemImage: "heart.fill")
                        .font(.caption2)
                        .foregroundColor(hpColor)
                }
            }
            
            Spacer()
        }
        .padding(.vertical, 4)
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


